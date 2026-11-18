import { requireAdmin } from "@/lib/admin";
import { MOD } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { criteriaFor, FINALS_CRITERIA, validateSheet } from "@/lib/scoring";
import { rpc, selectRows } from "@/lib/supabase";
import { cleanMultiline } from "@/lib/validation";

/**
 * POST /api/admin/score-corrections { sheetId, scores, justifications, reason }
 * A locked score sheet can only be corrected by the Moderator, with a written
 * reason and a ledger entry; the original is kept (10.8).
 */
export const POST = route("admin-score-correction", async (request) => {
  const auth = await requireAdmin(request, MOD);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { sheetId?: unknown; scores?: unknown; justifications?: unknown; reason?: unknown };

  const sheetId = Number(input.sheetId);
  const reason = cleanMultiline(input.reason).slice(0, 1000);
  if (!Number.isInteger(sheetId) || sheetId < 1) return errorResponse(422, "Send a sheetId.");
  if (!reason) return errorResponse(422, "A written reason is required.", { reason: "Required." });

  const { rows } = await selectRows<{ stage: number; teams: { track: "Beginner" | "Advanced" } }>("score_sheets", {
    select: "stage,teams!inner(track)", id: `eq.${sheetId}`,
  });
  const sheet = rows[0];
  if (!sheet) return errorResponse(404, "Score sheet not found.");

  const checked = validateSheet(sheet.stage === 2 ? FINALS_CRITERIA : criteriaFor(sheet.teams.track), input);
  if (!checked.ok) return errorResponse(422, "Please fix the highlighted fields.", checked.errors);

  const result = await rpc("correct_score_sheet", {
    p_sheet_id: sheetId, p_scores: checked.scores, p_total: checked.total, p_reason: reason, p_moderator: auth.actor,
  });
  await audit(auth.actor, "score_corrected", String(sheetId), { newTotal: checked.total });
  return okResponse(result);
});
