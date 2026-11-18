/**
 * Scoring matrices and the pure scoring logic (rulebook Sections 10 to 13).
 * Nothing here touches the network: it is the part that must be exactly right
 * and exactly auditable, so it is covered by tests/scoring.test.ts.
 */

import type { Track } from "./rules";

export interface Criterion {
  key: string;
  label: string;
  /** Total points for the criterion in the published matrix. */
  max: number;
  /** Part scored by judges. */
  judgeMax: number;
  /** Part computed by script (requirements checklist, benchmark). */
  scriptMax: number;
}

const c = (key: string, label: string, max: number, scriptMax = 0): Criterion => ({
  key, label, max, scriptMax, judgeMax: max - scriptMax,
});

/** Section 11. Technical implementation = requirements checklist (15, script) + correctness (10, judges). */
export const BEGINNER_CRITERIA: readonly Criterion[] = [
  c("problem_understanding", "Problem understanding and approach", 15),
  c("technical_implementation", "Technical implementation", 25, 15),
  c("domain_accuracy", "Space-domain accuracy", 15),
  c("innovation", "Innovation and creativity", 10),
  c("code_quality", "Code quality and documentation", 10),
  c("demo_communication", "Demo and communication", 15),
  c("process_learning", "Process and learning", 10),
];

/** Section 12. Benchmark performance is wholly script-scored. */
export const ADVANCED_CRITERIA: readonly Criterion[] = [
  c("technical_depth", "Technical depth and engineering rigour", 25),
  c("benchmark", "Benchmark performance", 20, 20),
  c("innovation", "Innovation and novelty", 15),
  c("domain_correctness", "Domain correctness and mission relevance", 15),
  c("system_design", "System design and feasibility", 10),
  c("reproducibility", "Reproducibility and code quality", 5),
  c("report_demo", "Report and demo", 10),
];

/** Stage 2 finals matrix, the same for both tracks (Section 10). */
export const FINALS_CRITERIA: readonly Criterion[] = [
  c("technical_defence", "Technical defence and viva", 40),
  c("pitch_demo", "Pitch and live demo", 30),
  c("impact_feasibility", "Impact and feasibility", 20),
  c("individual_understanding", "Individual understanding", 10),
];

export function criteriaFor(track: Track): readonly Criterion[] {
  return track === "Beginner" ? BEGINNER_CRITERIA : ADVANCED_CRITERIA;
}

/** Criterion keys used by the tie-breakers (Section 13). */
export function tieBreakKeys(track: Track): { technical: string; domain: string } {
  return track === "Beginner"
    ? { technical: "technical_implementation", domain: "domain_accuracy" }
    : { technical: "technical_depth", domain: "domain_correctness" };
}

export const FINALISTS_PER_TRACK = 8;
export const STAGE_WEIGHTS = { stage1: 0.6, stage2: 0.4 } as const;
export const VACANT_AWARD_MIN_S1 = 50;
/** Moderation triggers (10.6). */
export const MODERATION_TOTAL_GAP = 15;
export const MODERATION_CRITERION_GAP = 0.4;

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type Band = "Exceptional" | "Strong" | "Adequate" | "Weak";

/** Section 11 bands: 90-100, 70-89, 40-69 and 0-39 percent of the maximum. */
export function bandOf(score: number, max: number): Band {
  if (max <= 0) return "Weak";
  const share = (score / max) * 100;
  if (share >= 90) return "Exceptional";
  if (share >= 70) return "Strong";
  if (share >= 40) return "Adequate";
  return "Weak";
}

export interface SheetInput {
  scores: Record<string, number>;
  justifications: Record<string, string>;
}

export type SheetValidation =
  | { ok: true; scores: Record<string, number>; justifications: Record<string, string>; total: number }
  | { ok: false; errors: Record<string, string> };

/**
 * A judge scores every judge-scored criterion within its maximum and gives a
 * one-line justification (Section 11). Unknown keys are rejected.
 */
export function validateSheet(criteria: readonly Criterion[], input: unknown): SheetValidation {
  const errors: Record<string, string> = {};
  const raw = (input ?? {}) as { scores?: unknown; justifications?: unknown };
  const rawScores = (typeof raw.scores === "object" && raw.scores ? raw.scores : {}) as Record<string, unknown>;
  const rawJust = (typeof raw.justifications === "object" && raw.justifications ? raw.justifications : {}) as Record<string, unknown>;
  const known = new Set(criteria.map((x) => x.key));

  for (const key of Object.keys(rawScores)) {
    if (!known.has(key)) errors[key] = "Unknown criterion.";
  }

  const scores: Record<string, number> = {};
  const justifications: Record<string, string> = {};
  let total = 0;

  for (const crit of criteria) {
    if (crit.judgeMax <= 0) continue; // script-scored only
    const value = rawScores[crit.key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors[crit.key] = "Enter a score.";
      continue;
    }
    if (value < 0 || value > crit.judgeMax) {
      errors[crit.key] = `Score must be between 0 and ${crit.judgeMax}.`;
      continue;
    }
    const just = typeof rawJust[crit.key] === "string" ? (rawJust[crit.key] as string).replace(/\s+/g, " ").trim() : "";
    if (!just) {
      errors[`${crit.key}.justification`] = "Add a one-line justification.";
      continue;
    }
    scores[crit.key] = round2(value);
    justifications[crit.key] = just.slice(0, 300);
    total += scores[crit.key];
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, scores, justifications, total: round2(total) };
}

export interface Sheet {
  judgeId: string;
  total: number;
  scores: Record<string, number>;
}

/** Section 10.6: a third judge scores it when two judges differ too much. */
export function needsThirdJudge(a: Sheet, b: Sheet, criteria: readonly Criterion[]): boolean {
  if (Math.abs(a.total - b.total) > MODERATION_TOTAL_GAP) return true;
  return criteria.some(
    (crit) =>
      crit.judgeMax > 0 &&
      Math.abs((a.scores[crit.key] ?? 0) - (b.scores[crit.key] ?? 0)) > MODERATION_CRITERION_GAP * crit.judgeMax,
  );
}

/** The two sheets whose totals are closest (first pair wins a tie). */
export function closestPair(sheets: readonly Sheet[]): [Sheet, Sheet] | null {
  if (sheets.length < 2) return null;
  let best: [Sheet, Sheet] = [sheets[0], sheets[1]];
  let gap = Math.abs(sheets[0].total - sheets[1].total);
  for (let i = 0; i < sheets.length; i += 1) {
    for (let j = i + 1; j < sheets.length; j += 1) {
      const g = Math.abs(sheets[i].total - sheets[j].total);
      if (g < gap) {
        gap = g;
        best = [sheets[i], sheets[j]];
      }
    }
  }
  return best;
}

export interface JudgedResult {
  /** Mean judge-scored total (script points not included). */
  judgeMean: number;
  /** Mean per-criterion scores of the sheets used. */
  criterionMeans: Record<string, number>;
  sheetsUsed: number;
  /** True while two judges disagree and no third sheet exists yet. */
  moderationPending: boolean;
  /** True when fewer than two sheets exist. */
  incomplete: boolean;
}

/** Stage 1 judge component: mean of the two closest of up to three sheets (10.6). */
export function combineJudgeSheets(sheets: readonly Sheet[], criteria: readonly Criterion[]): JudgedResult {
  if (sheets.length < 2) {
    const only = sheets[0];
    return {
      judgeMean: only ? only.total : 0,
      criterionMeans: only ? { ...only.scores } : {},
      sheetsUsed: sheets.length,
      moderationPending: false,
      incomplete: true,
    };
  }
  const pair = sheets.length >= 3 ? closestPair(sheets)! : ([sheets[0], sheets[1]] as [Sheet, Sheet]);
  const moderationPending = sheets.length === 2 && needsThirdJudge(pair[0], pair[1], criteria);
  const means: Record<string, number> = {};
  for (const crit of criteria) {
    if (crit.judgeMax <= 0) continue;
    means[crit.key] = round2(((pair[0].scores[crit.key] ?? 0) + (pair[1].scores[crit.key] ?? 0)) / 2);
  }
  return {
    judgeMean: round2((pair[0].total + pair[1].total) / 2),
    criterionMeans: means,
    sheetsUsed: sheets.length,
    moderationPending,
    incomplete: false,
  };
}

// ── Script-scored parts ─────────────────────────────────────────────────────

/** Section 12: 20 x min(1, max(0, (team - base) / (ref - base))). Higher is better. */
export function benchmarkPoints(team: number, baseline: number, reference: number): number {
  if (![team, baseline, reference].every(Number.isFinite) || reference <= baseline) return 0;
  const share = Math.min(1, Math.max(0, (team - baseline) / (reference - baseline)));
  return round2(20 * share);
}

/** Section 11: requirements coverage is 15 points, each must-have item weighted equally. */
export function requirementsPoints(working: number, total: number): number {
  if (!Number.isFinite(working) || !Number.isFinite(total) || total <= 0) return 0;
  return round2(15 * Math.min(1, Math.max(0, working / total)));
}

export interface ScriptFacts {
  requirementsWorking?: number | null;
  requirementsTotal?: number | null;
  benchmarkPrivate?: number | null;
  benchmarkBaseline?: number | null;
  benchmarkReference?: number | null;
  /** 12.3: a reproduction mismatch voids the benchmark score. */
  cleanRunOk?: boolean | null;
}

export function scriptPoints(track: Track, facts: ScriptFacts | null): number {
  if (!facts) return 0;
  if (track === "Beginner") {
    return requirementsPoints(facts.requirementsWorking ?? 0, facts.requirementsTotal ?? 0);
  }
  if (facts.cleanRunOk === false) return 0;
  if (facts.benchmarkPrivate == null || facts.benchmarkBaseline == null || facts.benchmarkReference == null) return 0;
  return benchmarkPoints(facts.benchmarkPrivate, facts.benchmarkBaseline, facts.benchmarkReference);
}

// ── Penalties (Section 13) ──────────────────────────────────────────────────

export const AUTO_PENALTIES = { grace: 5, missedCheckpoint: 3, missingItem: 5 } as const;

/** Ranges allowed for manual penalties; the OC picks a value inside the range "by extent". */
export const MANUAL_PENALTY_RULES = {
  identity_leak: { min: 3, max: 3 },
  undeclared_third_party: { min: 5, max: 15 },
  undeclared_ai: { min: 5, max: 10 },
  conduct_repeat: { min: 10, max: 10 },
} as const;
export type ManualPenaltyCode = keyof typeof MANUAL_PENALTY_RULES;

export function manualPenaltyValid(code: string, points: number): boolean {
  const rule = (MANUAL_PENALTY_RULES as Record<string, { min: number; max: number }>)[code];
  return Boolean(rule) && Number.isFinite(points) && points >= rule.min && points <= rule.max;
}

export interface PenaltyInputs {
  usedGrace: boolean;
  missedCheckpoints: number;
  missingItems: number;
  manual: readonly { code: string; points: number }[];
}

export interface PenaltyLine {
  code: string;
  points: number;
}

export function computePenalties(input: PenaltyInputs): { total: number; lines: PenaltyLine[] } {
  const lines: PenaltyLine[] = [];
  if (input.usedGrace) lines.push({ code: "grace_window", points: AUTO_PENALTIES.grace });
  if (input.missedCheckpoints > 0) {
    lines.push({ code: "missed_checkpoint", points: input.missedCheckpoints * AUTO_PENALTIES.missedCheckpoint });
  }
  if (input.missingItems > 0) {
    lines.push({ code: "missing_item", points: input.missingItems * AUTO_PENALTIES.missingItem });
  }
  for (const m of input.manual) lines.push({ code: m.code, points: m.points });
  return { total: round2(lines.reduce((sum, l) => sum + l.points, 0)), lines };
}

/** Penalties come off the Stage 1 total; the total never goes below zero. */
export function stage1Total(judgeMean: number, script: number, penaltyTotal: number): number {
  return round2(Math.max(0, judgeMean + script - penaltyTotal));
}

export function stage2Score(sheets: readonly { total: number }[]): number | null {
  if (sheets.length === 0) return null;
  return round2(sheets.reduce((sum, s) => sum + s.total, 0) / sheets.length);
}

// ── Ranking and tie-breakers ────────────────────────────────────────────────

export interface RankInput {
  teamId: string;
  /** Excluded from ranking entirely (disqualified or failed Stage 0). */
  eligible: boolean;
  stage1: number;
  stage2: number | null;
  /** Criterion means from Stage 1 including script points, keyed like the matrices. */
  technical: number;
  domain: number;
  /** Stage 2 "Technical defence and viva" score. */
  viva: number | null;
}

export interface Ranked extends RankInput {
  finalist: boolean;
  final: number;
  rank: number;
  /** The tie survived every automatic tie-breaker; the Grand Jury votes (13, tie-breaker 4). */
  juryVoteRequired: boolean;
}

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Top 8 by Stage 1 are finalists; their final is 0.6 x S1 + 0.4 x S2. Everyone
 * else is ranked by S1 alone and placed below the finalists (Section 10).
 */
export function rankTeams(inputs: readonly RankInput[]): Ranked[] {
  const eligible = inputs.filter((t) => t.eligible);
  const byS1 = [...eligible].sort(compareStage1);
  const finalistIds = new Set(byS1.slice(0, FINALISTS_PER_TRACK).map((t) => t.teamId));

  const rows = eligible.map<Ranked>((t) => {
    const finalist = finalistIds.has(t.teamId);
    const final = finalist && t.stage2 != null
      ? round2(STAGE_WEIGHTS.stage1 * t.stage1 + STAGE_WEIGHTS.stage2 * t.stage2)
      : t.stage1;
    return { ...t, finalist, final, rank: 0, juryVoteRequired: false };
  });

  rows.sort((a, b) => {
    if (a.finalist !== b.finalist) return a.finalist ? -1 : 1;
    return compareRanked(a, b);
  });

  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    if (prev && prev.finalist === row.finalist && compareRanked(prev, row) === 0) {
      row.rank = prev.rank;
      row.juryVoteRequired = true;
      prev.juryVoteRequired = true;
    } else {
      row.rank = i + 1;
    }
  });
  return rows;
}

function compareStage1(a: RankInput, b: RankInput): number {
  if (!eq(a.stage1, b.stage1)) return b.stage1 - a.stage1;
  if (!eq(a.technical, b.technical)) return b.technical - a.technical;
  if (!eq(a.domain, b.domain)) return b.domain - a.domain;
  return 0;
}

/** Tie-breakers in order: technical criterion, domain criterion, Stage 2 viva (finalists). */
function compareRanked(a: Ranked, b: Ranked): number {
  if (!eq(a.final, b.final)) return b.final - a.final;
  if (!eq(a.technical, b.technical)) return b.technical - a.technical;
  if (!eq(a.domain, b.domain)) return b.domain - a.domain;
  if (a.finalist && b.finalist && a.viva != null && b.viva != null && !eq(a.viva, b.viva)) {
    return b.viva - a.viva;
  }
  return 0;
}

/** 14.5: an award may stay vacant if no team in the track reaches a Stage 1 score of 50. */
export function awardsMayBeVacant(ranked: readonly Ranked[]): boolean {
  return !ranked.some((t) => t.stage1 >= VACANT_AWARD_MIN_S1);
}

// ── Judge assignment (10.1, 10.2) ───────────────────────────────────────────

export interface AssignJudge {
  id: string;
  load: number;
}

/**
 * Give each team `perTeam` judges, skipping conflicts of interest and spreading
 * the load evenly. Returns judge ids per team, or the teams that could not be filled.
 */
export function assignJudges(
  teamIds: readonly string[],
  judges: readonly AssignJudge[],
  conflicts: ReadonlySet<string>, // `${judgeId}|${teamId}`
  perTeam = 2,
): { assignments: Record<string, string[]>; unfilled: string[] } {
  const load = new Map(judges.map((j) => [j.id, j.load]));
  const assignments: Record<string, string[]> = {};
  const unfilled: string[] = [];

  for (const teamId of teamIds) {
    const pool = judges
      .filter((j) => !conflicts.has(`${j.id}|${teamId}`))
      .sort((a, b) => (load.get(a.id)! - load.get(b.id)!) || a.id.localeCompare(b.id));
    const chosen = pool.slice(0, perTeam).map((j) => j.id);
    if (chosen.length < perTeam) unfilled.push(teamId);
    for (const id of chosen) load.set(id, load.get(id)! + 1);
    assignments[teamId] = chosen;
  }
  return { assignments, unfilled };
}
