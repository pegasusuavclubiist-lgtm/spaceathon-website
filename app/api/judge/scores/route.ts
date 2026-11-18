import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { appendLedger } from "@/lib/ledger";
import { route } from "@/lib/route";
import { criteriaFor, FINALS_CRITERIA, bandOf, validateSheet } from "@/lib/scoring";
import { insertRow, selectRows } from "@/lib/supabase";
import { cleanMultiline } from "@/lib/validation";

/**
 * POST /api/judge/scores { teamCode, stage, scores, justifications, comment? }
 * Submits a locked score sheet (Annex C). One per judge, team and stage; a
 * correction needs the Moderator (10.8). Stage 1 judges do not see each
 * other's sheets, and nothing is returned that reveals another judge's score.
 */
export const POST = route("judge-score", async (request) => {
  const auth = await requireJudge(request);
  if (!auth.ok) return auth.response;
  const { judge } = auth;
  const body = await readJson(request, 32 * 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as Record<string, unknown>;

  const code = String(input.teamCode ?? "");
  const stage = Number(input.stage);
  if (!/^[BA]-\d{3}$/.test(code) || (stage !== 1 && stage !== 2)) return errorResponse(422, "Send teamCode and stage (1 or 2).");
  if (stage === 1 && judge.role === "grand_jury") return errorResponse(403, "The Grand Jury scores the finals only.");
  if (stage === 2 && judge.role !== "grand_jury") return errorResponse(403, "Only the Grand Jury scores the finals.");

  const { rows: teams } = await selectRows<{ id: string; track: "Beginner" | "Advanced" }>("teams", {
    select: "id,track", team_code: `eq.${code}`, disqualified: "eq.false",
  });
  const team = teams[0];
  if (!team) return errorResponse(404, "Team not found.");

  const [assigned, conflict, existing] = await Promise.all([
    selectRows("judge_assignments", { select: "team_id", judge_id: `eq.${judge.id}`, team_id: `eq.${team.id}`, stage: `eq.${stage}` }),
    selectRows("judge_conflicts", { select: "team_id", judge_id: `eq.${judge.id}`, team_id: `eq.${team.id}` }),
    selectRows("score_sheets", { select: "id", judge_id: `eq.${judge.id}`, team_id: `eq.${team.id}`, stage: `eq.${stage}` }),
  ]);
  if (assigned.rows.length === 0 || conflict.rows.length > 0) return errorResponse(403, "This team is not assigned to you.");
  if (existing.rows.length > 0) return errorResponse(409, "You have already submitted this sheet. Ask the Moderator for a correction.");

  const criteria = stage === 2 ? FINALS_CRITERIA : criteriaFor(team.track);
  const checked = validateSheet(criteria, input);
  if (!checked.ok) return errorResponse(422, "Please fix the highlighted fields.", checked.errors);

  const sheet = await insertRow<{ id: number }>("score_sheets", {
    judge_id: judge.id, team_id: team.id, stage,
    scores: checked.scores, justifications: checked.justifications,
    comment: cleanMultiline(input.comment).slice(0, 2000) || null,
    total: checked.total,
  }, "id");
  await appendLedger("score_sheet", code, { judge: judge.id, stage, total: checked.total, sheet: sheet.id });
  await audit(`judge:${judge.id}`, "score_sheet_submitted", code, { stage, total: checked.total });

  return okResponse({
    id: sheet.id, total: checked.total,
    bands: Object.fromEntries(criteria.filter((c) => c.judgeMax > 0).map((c) => [c.key, bandOf(checked.scores[c.key], c.judgeMax)])),
  }, 201);
});
