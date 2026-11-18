import { errorResponse, okResponse } from "@/lib/http";
import { requireMember } from "@/lib/portal-auth";
import { route } from "@/lib/route";
import { selectRows } from "@/lib/supabase";

/**
 * GET /api/portal/feedback
 * After final results, every team gets its criterion-level Stage 1 scores and
 * anonymised judge comments (10.9). Judge identities are never exposed.
 */
export const GET = route("portal-feedback", async (request) => {
  const auth = await requireMember(request);
  if (!auth.ok) return auth.response;
  const { team } = auth.member;

  const { rows: res } = await selectRows<{ phase: string; stage1: number | null; stage2: number | null; final: number | null; rank: number | null; detail: Record<string, unknown> }>(
    "results", { select: "phase,stage1,stage2,final,rank,detail", team_id: `eq.${team.id}` },
  );
  const result = res[0];
  if (!result || result.phase !== "final") return errorResponse(403, "Feedback is released with the final results.");

  const { rows: sheets } = await selectRows<{ scores: Record<string, number>; justifications: Record<string, string>; comment: string | null }>(
    "score_sheets", { select: "scores,justifications,comment", team_id: `eq.${team.id}`, stage: "eq.1", order: "id.asc" },
  );
  return okResponse({
    stage1: result.stage1, stage2: result.stage2, final: result.final, rank: result.rank,
    penalties: (result.detail as { penalties?: unknown }).penalties ?? [],
    criterionMeans: (result.detail as { criterionMeans?: unknown }).criterionMeans ?? {},
    comments: sheets.map((s, i) => ({ judge: `Judge ${i + 1}`, justifications: s.justifications, comment: s.comment })),
  });
});
