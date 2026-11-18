import { okResponse } from "@/lib/http";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/results?track=
 * Public leaderboard once results are published. Draft results are never
 * returned (results stay sealed until announcement, Section 9). Only the
 * winners' names and institutions are published (15.6); here, team name and rank.
 */
export const GET = route("public-results", async (request) => {
  const track = new URL(request.url).searchParams.get("track");
  const { rows } = await selectRows<{
    track: string; rank: number; final: number; phase: string; teams: { team_name: string; team_code: string };
  }>("results", {
    select: "track,rank,final,phase,teams!inner(team_name,team_code)",
    phase: "in.(provisional,final)",
    rank: "not.is.null",
    order: "rank.asc",
    ...(track ? { track: `eq.${track}` } : {}),
  });
  return okResponse({
    results: rows.map((r) => ({ track: r.track, rank: r.rank, teamName: r.teams.team_name, teamCode: r.teams.team_code, score: r.final, phase: r.phase })),
  });
});
