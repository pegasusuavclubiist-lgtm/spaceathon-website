import { okResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/** GET /api/portal/checkpoints: what the team has recorded so far. */
export const GET = route("portal-checkpoints", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { rows } = await selectRows<{
    n: number; note: string | null; word_count: number | null; repo_sha: string | null;
    present_positions: number[] | null; recorded_at: string;
  }>("checkpoints", {
    select: "n,note,word_count,repo_sha,present_positions,recorded_at",
    team_id: `eq.${auth.member.team.id}`,
    order: "n.asc",
  });
  return okResponse({
    checkpoints: rows.map((r) => ({
      n: r.n, note: r.note, wordCount: r.word_count, commitSha: r.repo_sha,
      presentPositions: r.present_positions, recordedAt: r.recorded_at,
    })),
  });
});
