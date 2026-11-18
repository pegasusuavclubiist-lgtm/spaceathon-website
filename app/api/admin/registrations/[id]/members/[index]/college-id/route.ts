import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { getConfig, isDatabaseConfigured } from "@/lib/config";
import { errorResponse, notConfigured, okResponse, serverError } from "@/lib/http";
import { selectRows, signedDownloadUrl } from "@/lib/supabase";

const URL_TTL_SECONDS = 60;

/**
 * GET /api/admin/registrations/{id}/members/{index}/college-id
 * Returns a 60-second signed URL for the member's college ID and logs the access.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; index: string }> },
): Promise<Response> {
  try {
    if (!isDatabaseConfigured(getConfig())) return notConfigured();
    const auth = await requireAdmin(request);
    if (!auth.ok) return auth.response;

    const { id, index } = await context.params;
    if (!TEAM_ID_PATTERN.test(id) || !/^[0-3]$/.test(index)) {
      return errorResponse(404, "College ID not found.");
    }

    const { rows } = await selectRows<{ id_object_path: string | null; id_content_type: string | null }>(
      "team_members",
      {
        select: "id_object_path,id_content_type",
        team_id: `eq.${id}`,
        position: `eq.${index}`,
      },
    );
    const path = rows[0]?.id_object_path;
    if (!path) return errorResponse(404, "College ID not found.");

    const extension = path.split(".").pop() ?? "bin";
    const url = await signedDownloadUrl(path, URL_TTL_SECONDS, `${id}-member-${index}.${extension}`);

    // Viewing an ID is sensitive: always leave a trace (rulebook Section 9).
    await audit(auth.actor, "college_id_viewed", id, { memberIndex: Number(index) });

    return okResponse({ url, expiresInSeconds: URL_TTL_SECONDS });
  } catch (error) {
    return serverError("admin-college-id", error);
  }
}
