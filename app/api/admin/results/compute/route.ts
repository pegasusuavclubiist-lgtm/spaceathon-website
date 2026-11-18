import { requireAdmin } from "@/lib/admin";
import { JUDGING } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { computeTrackResults, saveResults } from "@/lib/results-service";

/**
 * POST /api/admin/results/compute { track, save?: boolean }
 * Computes Stage 1, finalists, Stage 2 and the final ranking by script (9: results
 * "computed by script"). `save: true` stores them as a draft and appends a ledger entry.
 * The response flags anything that needs a human: pending moderation, incomplete
 * judging, ties that need a Grand Jury vote, and awards that may stay vacant (14.5).
 */
export const POST = route("admin-results-compute", async (request) => {
  const auth = await requireAdmin(request, JUDGING);
  if (!auth.ok) return auth.response;
  const body = await readJson(request, 1024);
  if (!body.ok) return body.response;
  const input = (body.body ?? {}) as { track?: unknown; save?: unknown };
  if (input.track !== "Beginner" && input.track !== "Advanced") return errorResponse(422, "Use Beginner or Advanced.", { track: "Invalid track." });

  const results = await computeTrackResults(input.track);
  let ledgerHash: string | null = null;
  if (input.save === true) {
    ledgerHash = (await saveResults(results, auth.actor)).ledgerHash;
    await audit(auth.actor, "results_computed", null, { track: input.track, teams: results.teams.length });
  }
  return okResponse({ ...results, saved: input.save === true, ledgerHash });
});
