import { okResponse } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/judge/assignments
 * Stage 1 judges see Team IDs only (blind). Grand Jury members see finalists
 * through /api/judge/finalists and never see Stage 1 scores (10.1).
 */
export const GET = route("judge-assignments", async (request) => {
  const auth = await requireJudge(request);
  if (!auth.ok) return auth.response;
  const { judge } = auth;

  const { rows } = await selectRows<{
    team_id: string; stage: number; third: boolean; teams: { team_code: string; track: string };
  }>("judge_assignments", {
    select: "team_id,stage,third,teams!inner(team_code,track)",
    judge_id: `eq.${judge.id}`,
  });
  const { rows: done } = await selectRows<{ team_id: string; stage: number }>("score_sheets", {
    select: "team_id,stage", judge_id: `eq.${judge.id}`,
  });
  return okResponse({
    judge: { id: judge.id, role: judge.role },
    assignments: rows.map((r) => ({
      teamCode: r.teams.team_code,
      track: r.teams.track,
      stage: r.stage,
      moderation: r.third,
      scored: done.some((d) => d.team_id === r.team_id && d.stage === r.stage),
    })),
  });
});
