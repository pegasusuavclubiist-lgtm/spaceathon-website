import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { updateRows } from "@/lib/supabase";

/**
 * POST /api/admin/results/audit { teamId, passed }
 * Records the winner audit: a clean-environment re-run of a top-3 submission,
 * reproduced within tolerance (default +-2%) (9.4). Prizes need a pass (14.1).
 */
export const POST = route("admin-winner-audit", async (request) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { teamId?: unknown; passed?: unknown };
  const teamId = String(input.teamId ?? "");
  if (!TEAM_ID_PATTERN.test(teamId) || typeof input.passed !== "boolean") return errorResponse(422, "Send teamId and passed (true or false).");
  const n = await updateRows("results", { team_id: `eq.${teamId}` }, { audit_passed: input.passed });
  if (n === 0) return errorResponse(404, "No stored result for that team.");
  await audit(auth.actor, "winner_audit", teamId, { passed: input.passed });
  await appendLedger("winner_audit", teamId, { passed: input.passed, actor: auth.actor });
  return okResponse({ teamId, passed: input.passed });
});
