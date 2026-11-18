import { requireAdmin } from "@/lib/admin";
import { OC } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { manualPenaltyValid, MANUAL_PENALTY_RULES } from "@/lib/scoring";
import { insertRow } from "@/lib/supabase";
import { cleanMultiline } from "@/lib/validation";

/**
 * POST /api/admin/penalties { teamId, code, points, reason }
 * Manual penalties from Section 13 with their allowed ranges. Grace, missed
 * checkpoints and missing items are computed automatically.
 */
export const POST = route("admin-penalty", async (request) => {
  const auth = await requireAdmin(request, OC);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 4096);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;

  const teamId = String(input.teamId ?? "");
  const code = String(input.code ?? "");
  const points = Number(input.points);
  const reason = cleanMultiline(input.reason).slice(0, 1000);
  if (!TEAM_ID_PATTERN.test(teamId)) return errorResponse(404, "Team not found.");
  if (!manualPenaltyValid(code, points)) {
    return errorResponse(422, "Invalid penalty.", {
      code: `Use one of ${Object.entries(MANUAL_PENALTY_RULES).map(([k, v]) => `${k} (${v.min === v.max ? v.min : `${v.min}-${v.max}`})`).join(", ")}.`,
    });
  }
  if (!reason) return errorResponse(422, "Give a reason.", { reason: "A reason is required." });

  const row = await insertRow<{ id: number }>("penalties", { team_id: teamId, code, points, reason, applied_by: auth.actor }, "id");
  await audit(auth.actor, "penalty_applied", teamId, { code, points });
  await appendLedger("penalty", teamId, { code, points, actor: auth.actor });
  return okResponse({ id: row.id, code, points }, 201);
});
