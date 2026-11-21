import { okResponse } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/judge/assignments
 * Stage 1 judges see Team IDs only (blind), along with each team's AI usage
 * summary if analyzed. Grand Jury members see finalists through
 * /api/judge/finalists and never see Stage 1 scores (10.1).
 */
export const GET = route("judge-assignments", async (request) => {
  const auth = await requireJudge(request);
  if (!auth.ok) return auth.response;
  const { judge } = auth;

  const { rows } = await selectRows<{
    team_id: string;
    stage: number;
    third: boolean;
    teams: { team_code: string; track: string };
  }>("judge_assignments", {
    select: "team_id,stage,third,teams!inner(team_code,track)",
    judge_id: `eq.${judge.id}`,
  });

  const { rows: done } = await selectRows<{ team_id: string; stage: number }>(
    "score_sheets",
    {
      select: "team_id,stage",
      judge_id: `eq.${judge.id}`,
    },
  );

  // Fetch AI usage summaries for assigned teams (graceful if migration 0003 not applied yet)
  const aiMap = new Map<
    string,
    {
      overallAiPercent: number;
      riskLevel: string;
      undeclaredAiSuspected: boolean;
      declaredAiTools: string[];
    }
  >();

  if (rows.length > 0) {
    try {
      const teamIds = Array.from(new Set(rows.map((r) => r.team_id)));
      const { rows: aiRows } = await selectRows<{
        team_id: string;
        overall_ai_percent: number;
        risk_level: string;
        undeclared_ai_suspected: boolean;
        declared_ai_tools: string[];
      }>("ai_usage_reports", {
        select:
          "team_id,overall_ai_percent,risk_level,undeclared_ai_suspected,declared_ai_tools",
        team_id: `in.(${teamIds.join(",")})`,
      });
      for (const a of aiRows) {
        aiMap.set(a.team_id, {
          overallAiPercent: Number(a.overall_ai_percent),
          riskLevel: a.risk_level,
          undeclaredAiSuspected: Boolean(a.undeclared_ai_suspected),
          declaredAiTools: a.declared_ai_tools ?? [],
        });
      }
    } catch {
      /* table optional until migration 0003 is applied */
    }
  }

  return okResponse({
    judge: { id: judge.id, name: judge.name, role: judge.role, tracks: judge.tracks },
    assignments: rows.map((r) => ({
      teamCode: r.teams.team_code,
      track: r.teams.track,
      stage: r.stage,
      moderation: r.third,
      scored: done.some((d) => d.team_id === r.team_id && d.stage === r.stage),
      aiUsage: aiMap.get(r.team_id) ?? null,
    })),
  });
});
