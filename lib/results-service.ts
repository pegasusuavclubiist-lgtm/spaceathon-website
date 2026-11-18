/**
 * Computes a track's results from the database: Stage 1 (two judges, third on
 * disagreement, script points, penalties), finalists, Stage 2 and the final
 * ranking (rulebook Sections 10 to 13). The arithmetic itself lives in
 * lib/scoring.ts; this file only gathers the inputs and stores the output.
 */

import { getConfig } from "./config";
import { missedCheckpoints } from "./checkpoints";
import { appendLedger } from "./ledger";
import {
  combineJudgeSheets, computePenalties, criteriaFor, rankTeams, requirementsPoints, scriptPoints,
  stage1Total, stage2Score, tieBreakKeys, awardsMayBeVacant, type Ranked, type Sheet,
} from "./scoring";
import { insertRow, selectRows, updateRows } from "./supabase";
import { packageStatus } from "./submission-service";
import type { Track } from "./rules";
import { sha256Hex } from "./security";

interface TeamRow { id: string; team_code: string | null; team_name: string; disqualified: boolean; grace_granted: boolean }
interface SheetRow { judge_id: string; team_id: string; stage: number; scores: Record<string, number>; total: number }

export interface TeamResult extends Ranked {
  teamCode: string;
  penalties: { code: string; points: number }[];
  criterionMeans: Record<string, number>;
  scriptPoints: number;
  moderationPending: boolean;
  stage1Incomplete: boolean;
  stage0Passed: boolean;
}

export interface TrackResults {
  track: Track;
  teams: TeamResult[];
  awardsMayBeVacant: boolean;
  moderationPending: string[];
  incomplete: string[];
  juryVoteRequired: string[];
}

export async function computeTrackResults(track: Track): Promise<TrackResults> {
  const { rows: teams } = await selectRows<TeamRow>("teams", {
    select: "id,team_code,team_name,disqualified,grace_granted",
    track: `eq.${track}`,
    verification_status: "eq.verified",
  });
  const ids = teams.map((t) => t.id);
  const inList = `in.(${ids.join(",")})`;

  const empty = ids.length === 0;
  const [stage0, sheets, scripts, manual, cps, members] = empty
    ? [{ rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }, { rows: [] }]
    : await Promise.all([
        selectRows<{ team_id: string; passed: boolean }>("stage0_results", { select: "team_id,passed", team_id: inList }),
        selectRows<SheetRow>("score_sheets", { select: "judge_id,team_id,stage,scores,total", team_id: inList, limit: "10000" }),
        selectRows<{
          team_id: string; requirements_working: number | null; requirements_total: number | null;
          benchmark_private: number | null; benchmark_baseline: number | null; benchmark_reference: number | null;
          clean_run_ok: boolean | null;
        }>("script_scores", { select: "*", team_id: inList }),
        selectRows<{ team_id: string; code: string; points: number }>("penalties", { select: "team_id,code,points", team_id: inList }),
        selectRows<{ team_id: string; n: number; present_positions: number[] | null }>("checkpoints", { select: "team_id,n,present_positions", team_id: inList }),
        selectRows<{ team_id: string }>("team_members", { select: "team_id", team_id: inList }),
      ]);

  const criteria = criteriaFor(track);
  const keys = tieBreakKeys(track);
  const out: TeamResult[] = [];

  for (const team of teams) {
    if (!team.team_code) continue;
    const mine = (sheets.rows as SheetRow[]).filter((s) => s.team_id === team.id);
    const s1sheets: Sheet[] = mine.filter((s) => s.stage === 1).map((s) => ({ judgeId: s.judge_id, total: Number(s.total), scores: s.scores }));
    const s2sheets = mine.filter((s) => s.stage === 2).map((s) => ({ total: Number(s.total), scores: s.scores }));

    const judged = combineJudgeSheets(s1sheets, criteria);
    const facts = (scripts.rows as { team_id: string }[]).find((x) => x.team_id === team.id) as
      | Record<string, number | boolean | null> | undefined;
    const script = scriptPoints(track, facts ? {
      requirementsWorking: facts.requirements_working as number | null,
      requirementsTotal: facts.requirements_total as number | null,
      benchmarkPrivate: facts.benchmark_private as number | null,
      benchmarkBaseline: facts.benchmark_baseline as number | null,
      benchmarkReference: facts.benchmark_reference as number | null,
      cleanRunOk: facts.clean_run_ok as boolean | null,
    } : null);

    const memberCount = (members.rows as { team_id: string }[]).filter((m) => m.team_id === team.id).length;
    const status = await packageStatus({ id: team.id, code: team.team_code, track, graceGranted: team.grace_granted },
      getCutoff(team.grace_granted));
    const penalties = computePenalties({
      usedGrace: status.usedGrace,
      missedCheckpoints: missedCheckpoints(
        (cps.rows as { team_id: string; n: number; present_positions: number[] | null }[]).filter((c) => c.team_id === team.id),
        memberCount,
      ),
      missingItems: status.missing.length,
      manual: (manual.rows as { team_id: string; code: string; points: number }[])
        .filter((p) => p.team_id === team.id).map((p) => ({ code: p.code, points: Number(p.points) })),
    });

    const s1 = stage1Total(judged.judgeMean, script, penalties.total);
    const technical = (judged.criterionMeans[keys.technical] ?? 0) +
      (track === "Beginner" ? requirementsPoints(Number(facts?.requirements_working ?? 0), Number(facts?.requirements_total ?? 0)) : 0);
    const stage0Passed = (stage0.rows as { team_id: string; passed: boolean }[]).some((r) => r.team_id === team.id && r.passed);
    const viva = s2sheets.length ? s2sheets.reduce((s, x) => s + (x.scores.technical_defence ?? 0), 0) / s2sheets.length : null;

    out.push({
      teamId: team.id,
      teamCode: team.team_code,
      eligible: !team.disqualified && stage0Passed && !judged.incomplete,
      stage1: s1,
      stage2: stage2Score(s2sheets),
      technical,
      domain: judged.criterionMeans[keys.domain] ?? 0,
      viva,
      finalist: false, final: s1, rank: 0, juryVoteRequired: false,
      penalties: penalties.lines,
      criterionMeans: judged.criterionMeans,
      scriptPoints: script,
      moderationPending: judged.moderationPending,
      stage1Incomplete: judged.incomplete,
      stage0Passed,
    });
  }

  const ranked = rankTeams(out);
  const byId = new Map(ranked.map((r) => [r.teamId, r]));
  const merged = out.map((o) => ({ ...o, ...(byId.get(o.teamId) ?? {}) })) as TeamResult[];
  merged.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9));

  return {
    track,
    teams: merged,
    awardsMayBeVacant: awardsMayBeVacant(ranked),
    moderationPending: merged.filter((t) => t.moderationPending).map((t) => t.teamCode),
    incomplete: merged.filter((t) => t.stage1Incomplete).map((t) => t.teamCode),
    juryVoteRequired: merged.filter((t) => t.juryVoteRequired).map((t) => t.teamCode),
  };
}

/** Submission cutoff for a team: hard close, plus the grace window if it was granted. */
function getCutoff(graceGranted: boolean): Date | undefined {
  const t0 = getConfig().eventStart;
  if (!t0) return undefined;
  const close = t0.getTime() + 48 * 3600_000;
  return new Date(close + (graceGranted ? 10 * 60_000 : 0));
}

/** Store computed results (draft phase unless already published) and chain them into the ledger. */
export async function saveResults(results: TrackResults, actor: string): Promise<{ ledgerHash: string }> {
  const { rows: existing } = await selectRows<{ team_id: string; phase: string }>("results", {
    select: "team_id,phase", track: `eq.${results.track}`,
  });
  const phaseOf = new Map(existing.map((r) => [r.team_id, r.phase]));

  for (const t of results.teams) {
    const row = {
      track: results.track,
      stage1: t.stage1,
      stage2: t.stage2,
      final: t.final,
      rank: t.eligible ? t.rank : null,
      finalist: t.finalist,
      detail: {
        penalties: t.penalties, criterionMeans: t.criterionMeans, scriptPoints: t.scriptPoints,
        juryVoteRequired: t.juryVoteRequired, eligible: t.eligible, stage0Passed: t.stage0Passed,
      },
      computed_at: new Date().toISOString(),
    };
    if (phaseOf.has(t.teamId)) await updateRows("results", { team_id: `eq.${t.teamId}` }, row);
    else await insertRow("results", { team_id: t.teamId, ...row }, "team_id");
  }

  const summary = results.teams.map((t) => ({ c: t.teamCode, s1: t.stage1, s2: t.stage2, f: t.final, r: t.rank }));
  const entry = await appendLedger("results_computed", results.track, {
    actor, digest: sha256Hex(JSON.stringify(summary)), teams: summary.length,
  });
  return { ledgerHash: entry.hash };
}
