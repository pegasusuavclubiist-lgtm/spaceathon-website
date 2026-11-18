import { okResponse } from "@/lib/http";
import { requireJudge } from "@/lib/judge-auth";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/judge/finalists (Grand Jury only)
 * Finals are not blind (10.7): names are shown for the ID check. Stage 1 scores
 * are deliberately not included; the Grand Jury never sees them before scoring.
 */
export const GET = route("judge-finalists", async (request) => {
  const auth = await requireJudge(request, ["grand_jury"]);
  if (!auth.ok) return auth.response;
  const { rows } = await selectRows<{
    team_id: string; teams: { team_code: string; team_name: string; track: string; team_members: { position: number; full_name: string; college: string }[] };
  }>("judge_assignments", {
    select: "team_id,teams!inner(team_code,team_name,track,team_members(position,full_name,college))",
    judge_id: `eq.${auth.judge.id}`, stage: "eq.2",
  });
  return okResponse({
    finalists: rows.map((r) => ({
      teamCode: r.teams.team_code, teamName: r.teams.team_name, track: r.teams.track,
      members: [...r.teams.team_members].sort((a, b) => a.position - b.position).map((m) => ({ name: m.full_name, college: m.college })),
    })),
  });
});
