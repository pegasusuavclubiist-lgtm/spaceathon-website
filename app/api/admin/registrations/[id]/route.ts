import { requireAdmin } from "@/lib/admin";
import { activateTeam, type ActivationResult } from "@/lib/activation";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import {
  sendRegistrationConfirmationEmail,
  type ConfirmationEmailResult,
} from "@/lib/confirmation-mail";
import {
  errorResponse,
  notConfigured,
  okResponse,
  readJson,
  serverError,
} from "@/lib/http";
import { cleanMultiline } from "@/lib/validation";
import { selectRows, updateRows } from "@/lib/supabase";

const TEAM_SELECT =
  "id,team_name,team_code,track,leader_email,verification_status,rejection_reason,verified_at,verified_by," +
  "participant_category,fee_amount,payment_status,payment_utr,payment_proof_uploaded_at," +
  "payment_confirmed_at,payment_confirmed_by,payment_rejection_reason,confirmation_email_sent_at," +
  "legal_hold,rulebook_sha256,consented_at,created_at,updated_at," +
  "team_members(position,full_name,email,college,programme,id_content_type,id_size_bytes,id_uploaded_at)";

interface LoadedTeam {
  id: string;
  verification_status: string;
  payment_status: string | null;
  confirmation_email_sent_at: string | null;
  team_members: { position: number; id_uploaded_at: string | null }[];
}

async function loadTeam(id: string): Promise<LoadedTeam | null> {
  const { rows } = await selectRows<LoadedTeam>("teams", {
    select: TEAM_SELECT,
    id: `eq.${id}`,
  });
  return rows[0] ?? null;
}

/** GET /api/admin/registrations/{id} */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!TEAM_ID_PATTERN.test(id)) return errorResponse(404, "Registration not found.");

    const team = await loadTeam(id);
    if (!team) return errorResponse(404, "Registration not found.");
    return okResponse(team);
  } catch (error) {
    return serverError("admin-registration", error);
  }
}

/**
 * PATCH /api/admin/registrations/{id}
 * {
 *   paymentStatus?: "pending" | "confirmed" | "rejected",
 *   paymentRejectionReason?: string,
 *   resendConfirmationEmail?: boolean,
 *   verificationStatus?: "pending" | "verified" | "rejected",
 *   reason?: string,
 *   legalHold?: boolean
 * }
 *
 * Payment-first workflow:
 *  - Confirming payment (`paymentStatus: "confirmed"`) sends the official
 *    registration confirmation email to the team leader & all members.
 *  - Team verification (`verificationStatus: "verified"`) is strictly blocked
 *    until payment is confirmed.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    if (!TEAM_ID_PATTERN.test(id)) return errorResponse(404, "Registration not found.");

    const body = await readJson(request);
    if (!body.ok) return body.response;
    const input = (body.body ?? {}) as Record<string, unknown>;

    const team = await loadTeam(id);
    if (!team) return errorResponse(404, "Registration not found.");

    const patch: Record<string, unknown> = {};
    const detail: Record<string, unknown> = {};
    let shouldSendConfirmationEmail = false;

    const currentPaymentStatus = team.payment_status ?? "pending";
    let nextPaymentStatus = currentPaymentStatus;

    if (input.paymentStatus !== undefined) {
      const pStatus = input.paymentStatus;
      if (pStatus !== "pending" && pStatus !== "confirmed" && pStatus !== "rejected") {
        return errorResponse(422, "Invalid payment status.", {
          paymentStatus: "Use pending, confirmed or rejected.",
        });
      }

      if (pStatus === "confirmed") {
        Object.assign(patch, {
          payment_status: "confirmed",
          payment_confirmed_at: new Date().toISOString(),
          payment_confirmed_by: auth.actor,
          payment_rejection_reason: null,
        });
        if (currentPaymentStatus !== "confirmed" || !team.confirmation_email_sent_at) {
          shouldSendConfirmationEmail = true;
        }
      } else if (pStatus === "rejected") {
        const reason = cleanMultiline(input.paymentRejectionReason ?? input.reason).slice(0, 1000);
        if (!reason) {
          return errorResponse(422, "Give a reason for rejecting the payment.", {
            paymentRejectionReason: "A payment rejection reason is required.",
          });
        }
        Object.assign(patch, {
          payment_status: "rejected",
          payment_confirmed_at: null,
          payment_confirmed_by: null,
          payment_rejection_reason: reason,
        });
      } else {
        Object.assign(patch, {
          payment_status: "pending",
          payment_confirmed_at: null,
          payment_confirmed_by: null,
          payment_rejection_reason: null,
        });
      }
      nextPaymentStatus = pStatus;
      detail.paymentStatus = pStatus;
      detail.paymentFrom = currentPaymentStatus;
    }

    if (input.resendConfirmationEmail === true) {
      if (nextPaymentStatus !== "confirmed") {
        return errorResponse(
          409,
          "Confirm the team's payment first before sending the registration confirmation email.",
        );
      }
      shouldSendConfirmationEmail = true;
    }

    if (input.verificationStatus !== undefined) {
      const status = input.verificationStatus;
      if (status !== "pending" && status !== "verified" && status !== "rejected") {
        return errorResponse(422, "Invalid verification status.", {
          verificationStatus: "Use pending, verified or rejected.",
        });
      }

      if (status === "verified") {
        if (nextPaymentStatus !== "confirmed") {
          return errorResponse(
            409,
            "Payment must be confirmed first before verifying the team.",
            {
              paymentStatus: "Confirm payment before team verification.",
            },
          );
        }
        // Rulebook 3.5: every member's ID must be on file before verification.
        const missing = team.team_members.filter((m) => !m.id_uploaded_at).length;
        if (missing > 0) {
          return errorResponse(409, `${missing} member(s) have not uploaded a college ID.`, {
            verificationStatus: "Every member needs an uploaded college ID first.",
          });
        }
        Object.assign(patch, {
          verification_status: "verified",
          rejection_reason: null,
          verified_at: new Date().toISOString(),
          verified_by: auth.actor,
        });
      } else if (status === "rejected") {
        const reason = cleanMultiline(input.reason).slice(0, 1000);
        if (!reason) {
          return errorResponse(422, "Give a reason for the rejection.", {
            reason: "A rejection reason is required.",
          });
        }
        Object.assign(patch, {
          verification_status: "rejected",
          rejection_reason: reason,
          verified_at: null,
          verified_by: null,
        });
      } else {
        Object.assign(patch, {
          verification_status: "pending",
          rejection_reason: null,
          verified_at: null,
          verified_by: null,
        });
      }
      detail.verificationStatus = status;
      detail.from = team.verification_status;
    }

    if (input.legalHold !== undefined) {
      if (typeof input.legalHold !== "boolean") {
        return errorResponse(422, "legalHold must be true or false.");
      }
      patch.legal_hold = input.legalHold;
      detail.legalHold = input.legalHold;
    }

    if (Object.keys(patch).length === 0 && !shouldSendConfirmationEmail) {
      return errorResponse(422, "Nothing to update.");
    }

    if (Object.keys(patch).length > 0) {
      await updateRows("teams", { id: `eq.${id}` }, patch);
      await audit(auth.actor, "registration_updated", id, detail);
    }

    let confirmationEmail: ConfirmationEmailResult | null = null;
    if (shouldSendConfirmationEmail) {
      confirmationEmail = await sendRegistrationConfirmationEmail(id);
      await audit(auth.actor, "registration_confirmation_emailed", id, {
        delivery: confirmationEmail.delivery,
        emailedCount: confirmationEmail.emailedCount,
        failedCount: confirmationEmail.failedRecipients.length,
      });
    }

    // Verification activates the portal: Team ID, one personal key per member, email.
    let portal: ActivationResult | null = null;
    if (patch.verification_status === "verified") {
      portal = await activateTeam(id);
      await audit(auth.actor, "portal_activated", id, {
        teamCode: portal.teamCode,
        delivery: portal.delivery,
        alreadyActive: portal.alreadyActive,
      });
    }

    return okResponse({
      ...(await loadTeam(id)),
      ...(confirmationEmail ? { confirmationEmail } : {}),
      ...(portal ? { portal } : {}),
    });
  } catch (error) {
    return serverError("admin-registration-update", error);
  }
}
