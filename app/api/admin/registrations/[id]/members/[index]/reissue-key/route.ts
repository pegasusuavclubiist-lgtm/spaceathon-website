import { reissueMemberKey } from "@/lib/activation";
import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse } from "@/lib/http";
import { route } from "@/lib/route";

/**
 * POST /api/admin/registrations/{id}/members/{0-3}/reissue-key
 * Replaces a member's portal key (lost key, suspected sharing); the old key stops working.
 */
export const POST = route<{ id: string; index: string }>("admin-reissue-key", async (request, context) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const { id, index } = await context.params;
  if (!TEAM_ID_PATTERN.test(id) || !/^[0-3]$/.test(index)) return errorResponse(404, "Member not found.");

  const result = await reissueMemberKey(id, Number(index));
  if (!result) return errorResponse(404, "Member not found or the team is not verified.");
  await audit(auth.actor, "portal_key_reissued", id, { position: Number(index), delivery: result.delivery });
  return okResponse(result);
});
