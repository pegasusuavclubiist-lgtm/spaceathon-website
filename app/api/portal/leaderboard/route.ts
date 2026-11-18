import { okResponse, errorResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/** GET /api/portal/leaderboard: public-split leaderboard (30% of test inputs, 12.1). */
export const GET = route("portal-leaderboard", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  if (auth.member.team.track !== "Advanced") return errorResponse(404, "Only the Advanced track has a leaderboard.");

  const { rows } = await selectRows<{
    team_id: string; public_score: number; teams: { team_code: string | null; team_name: string; disqualified: boolean };
  }>("prediction_uploads", {
    select: "team_id,public_score,teams!inner(team_code,team_name,disqualified)",
    eval_status: "eq.scored",
    public_score: "not.is.null",
    limit: "5000",
  });

  const best = new Map<string, { name: string; code: string; score: number }>();
  for (const r of rows) {
    if (r.teams.disqualified || !r.teams.team_code) continue;
    const cur = best.get(r.team_id);
    if (!cur || r.public_score > cur.score) best.set(r.team_id, { name: r.teams.team_name, code: r.teams.team_code, score: r.public_score });
  }
  const board = [...best.entries()]
    .map(([teamId, v]) => ({ teamId, ...v }))
    .sort((a, b) => b.score - a.score)
    .map((v, i) => ({ rank: i + 1, teamCode: v.code, teamName: v.name, publicScore: v.score, you: v.teamId === auth.member.team.id }));
  return okResponse({ leaderboard: board, note: "Computed on the public 30% split only." });
});
