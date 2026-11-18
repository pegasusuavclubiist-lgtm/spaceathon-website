import { requireAdmin } from "@/lib/admin";
import { TECH } from "@/lib/admin-routes";
import { audit } from "@/lib/audit";
import { TEAM_ID_PATTERN } from "@/lib/college-id";
import { getConfig } from "@/lib/config";
import { errorResponse, okResponse, readJson } from "@/lib/http";
import { route } from "@/lib/route";
import { getMilestones } from "@/lib/schedule";
import { screenTeam } from "@/lib/stage0";
import { insertRow, selectRows, updateRows } from "@/lib/supabase";

/**
 * POST /api/admin/stage0
 * { teams: [{ teamId, firstCommitAt, commits: [{ at, additions }], maxSimilarityPercent, copiedReportText }] }
 * Stage 0 screening (10.3). Commit history and similarity come from the Technical
 * Committee's tooling; snapshot, manifest and checkpoint data come from this database.
 * Pass/fail only: review flags are for a human, and a failure is not a disqualification.
 */
export const POST = route("admin-stage0", async (request) => {
  const auth = await requireAdmin(request, TECH);
  if (!auth.ok) return auth.response;
  const m = getMilestones(getConfig());
  if (!m) return errorResponse(409, "The event schedule has not been set.");
  const body = await readJson(request, 1024 * 1024);
  if (!body.ok) return body.response;
  const list = (body.body as { teams?: unknown })?.teams;
  if (!Array.isArray(list) || list.length === 0) return errorResponse(422, "Send a non-empty teams array.");

  const results: { teamId: string; passed: boolean; issues: string[]; reviews: string[] }[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const teamId = String(raw.teamId ?? "");
    if (!TEAM_ID_PATTERN.test(teamId)) continue;
    const [snap, manifest] = await Promise.all([
      selectRows("repo_snapshots", { select: "team_id", team_id: `eq.${teamId}` }),
      selectRows("submission_manifests", { select: "team_id", team_id: `eq.${teamId}` }),
    ]);
    const commits = Array.isArray(raw.commits)
      ? (raw.commits as { at?: string; additions?: number }[])
          .filter((c) => c.at && Number.isFinite(Date.parse(c.at)))
          .map((c) => ({ at: new Date(c.at as string), additions: Math.max(0, Number(c.additions) || 0) }))
      : [];
    const first = raw.firstCommitAt ? new Date(String(raw.firstCommitAt)) : (commits.length ? new Date(Math.min(...commits.map((c) => c.at.getTime()))) : null);

    const outcome = screenTeam({
      t0: m.t0,
      checkpoints: [{ n: 1, at: m.checkpoint1 }, { n: 2, at: m.checkpoint2 }, { n: 3, at: m.checkpoint3 }],
      hasRepoSnapshot: snap.rows.length > 0,
      hasManifest: manifest.rows.length > 0,
      firstCommitAt: first && !Number.isNaN(first.getTime()) ? first : null,
      commits,
      maxSimilarityPercent: Number(raw.maxSimilarityPercent) || 0,
      copiedReportText: raw.copiedReportText === true,
    });

    const row = { passed: outcome.passed, issues: outcome.issues, reviews: outcome.reviews, run_by: auth.actor, run_at: new Date().toISOString() };
    const { rows: existing } = await selectRows("stage0_results", { select: "team_id", team_id: `eq.${teamId}` });
    if (existing.length) await updateRows("stage0_results", { team_id: `eq.${teamId}` }, row);
    else await insertRow("stage0_results", { team_id: teamId, ...row }, "team_id");
    results.push({ teamId, ...outcome });
  }
  await audit(auth.actor, "stage0_run", null, { teams: results.length, failed: results.filter((r) => !r.passed).length });
  return okResponse({ results });
});
