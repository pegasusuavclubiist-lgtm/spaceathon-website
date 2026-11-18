import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { updateRows } from "@/lib/supabase";
import { cleanMultiline } from "@/lib/validation";

/**
 * POST /api/admin/teams/{id}/disqualify { reason, reinstate? }
 * Disqualification is an OC decision on documented evidence after the team had
 * 24 hours to respond (9.2); this records it. Disqualified teams lose portal access.
 */
export const POST = route<{ id: string }>("admin-disqualify", async (request, context) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!TEAM_ID_PATTERN.test(id)) return errorResponse(404, "Team not found.");
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { reason?: unknown; reinstate?: unknown };

  const reinstate = input.reinstate === true;
  const reason = cleanMultiline(input.reason).slice(0, 1000);
  if (!reinstate && !reason) return errorResponse(422, "Give a reason.", { reason: "A reason is required." });

  const n = await updateRows("teams", { id: `eq.${id}` }, {
    disqualified: !reinstate, disqualified_reason: reinstate ? null : reason,
  });
  if (n === 0) return errorResponse(404, "Team not found.");
  await audit(auth.actor, reinstate ? "team_reinstated" : "team_disqualified", id, {});
  await appendLedger(reinstate ? "team_reinstated" : "team_disqualified", id, { actor: auth.actor });
  return okResponse({ id, disqualified: !reinstate });
});
