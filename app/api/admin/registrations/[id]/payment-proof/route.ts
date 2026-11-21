import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { errorResponse, notConfigured, okResponse, serverError } from "@/lib/http";
import { PAYMENT_PROOFS_BUCKET, selectRows, signedDownloadUrl } from "@/lib/supabase";

/** GET /api/admin/registrations/{id}/payment-proof — short-lived signed link. */
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

    const { rows } = await selectRows<{
      id: string;
      team_name: string;
      payment_proof_path: string | null;
      payment_proof_content_type: string | null;
    }>("teams", {
      select: "id,team_name,payment_proof_path,payment_proof_content_type",
      id: `eq.${id}`,
    });

    const team = rows[0];
    if (!team) return errorResponse(404, "Registration not found.");
    if (!team.payment_proof_path) {
      return errorResponse(404, "No payment screenshot was uploaded for this team.");
    }

    const ext = team.payment_proof_path.split(".").pop() ?? "bin";
    const downloadName = `${id}-payment-proof.${ext}`;
    const url = await signedDownloadUrl(
      team.payment_proof_path,
      300,
      downloadName,
      PAYMENT_PROOFS_BUCKET,
    );
    await audit(auth.actor, "payment_proof_viewed", id, {});
    return okResponse({
      url,
      contentType: team.payment_proof_content_type,
      expiresInSeconds: 300,
    });
  } catch (error) {
    return serverError("admin-payment-proof", error);
  }
}
