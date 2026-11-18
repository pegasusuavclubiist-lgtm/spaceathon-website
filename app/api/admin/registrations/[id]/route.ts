import { requireAdmin } from "@/lib/admin";
import { activateTeam, type ActivationResult } from "@/lib/activation";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
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
  "id,team_name,track,leader_email,verification_status,rejection_reason,verified_at,verified_by," +
  "legal_hold,rulebook_sha256,consented_at,created_at,updated_at," +
  "team_members(position,full_name,email,college,programme,id_content_type,id_size_bytes,id_uploaded_at)";

async function loadTeam(id: string) {
  const { rows } = await selectRows<{
    verification_status: string;
    team_members: { position: number; id_uploaded_at: string | null }[];
  }>("teams", { select: TEAM_SELECT, id: `eq.${id}` });
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
 * { verificationStatus?: "pending"|"verified"|"rejected", reason?: string,
 *   legalHold?: boolean }
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

    if (input.verificationStatus !== undefined) {
      const status = input.verificationStatus;
      if (status !== "pending" && status !== "verified" && status !== "rejected") {
        return errorResponse(422, "Invalid verification status.", {
          verificationStatus: "Use pending, verified or rejected.",
        });
      }

      if (status === "verified") {
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

    if (Object.keys(patch).length === 0) {
      return errorResponse(422, "Nothing to update.");
    }

    await updateRows("teams", { id: `eq.${id}` }, patch);
    await audit(auth.actor, "registration_updated", id, detail);

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

    return okResponse({ ...(await loadTeam(id)), ...(portal ? { portal } : {}) });
  } catch (error) {
    return serverError("admin-registration-update", error);
  }
}
