import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADVANCED_CRITERIA, BEGINNER_CRITERIA, FINALS_CRITERIA, assignJudges, bandOf, benchmarkPoints,
  closestPair, combineJudgeSheets, computePenalties, manualPenaltyValid, needsThirdJudge,
  rankTeams, requirementsPoints, stage1Total, validateSheet, type RankInput,
} from "../lib/scoring";

const sum = (c: readonly { max: number }[]) => c.reduce((s, x) => s + x.max, 0);

describe("matrices", () => {
  it("each matrix totals 100 points", () => {
    assert.equal(sum(BEGINNER_CRITERIA), 100);
    assert.equal(sum(ADVANCED_CRITERIA), 100);
    assert.equal(sum(FINALS_CRITERIA), 100);
  });
  it("splits script and judge points as in the rulebook", () => {
    const tech = BEGINNER_CRITERIA.find((c) => c.key === "technical_implementation")!;
    assert.deepEqual([tech.scriptMax, tech.judgeMax], [15, 10]);
    const bench = ADVANCED_CRITERIA.find((c) => c.key === "benchmark")!;
    assert.deepEqual([bench.scriptMax, bench.judgeMax], [20, 0]);
  });
  it("bands follow Section 11", () => {
    assert.equal(bandOf(90, 100), "Exceptional");
    assert.equal(bandOf(89, 100), "Strong");
    assert.equal(bandOf(70, 100), "Strong");
    assert.equal(bandOf(69, 100), "Adequate");
    assert.equal(bandOf(40, 100), "Adequate");
    assert.equal(bandOf(39, 100), "Weak");
  });
});

describe("validateSheet", () => {
  const good = () => {
    const scores: Record<string, number> = {};
    const justifications: Record<string, string> = {};
    for (const c of BEGINNER_CRITERIA) { scores[c.key] = c.judgeMax; justifications[c.key] = "ok"; }
    return { scores, justifications };
  };
  it("accepts a full sheet; judge total excludes the 15 script points", () => {
    const r = validateSheet(BEGINNER_CRITERIA, good());
    assert.equal(r.ok && r.total, 85);
  });
  it("rejects out-of-range, missing, unknown and unjustified entries", () => {
    const bad = good();
    bad.scores.innovation = 11;
    delete bad.scores.code_quality;
    bad.scores.bogus = 1;
    bad.justifications.domain_accuracy = "  ";
    const r = validateSheet(BEGINNER_CRITERIA, bad);
    assert.ok(!r.ok);
    if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["bogus", "code_quality", "domain_accuracy.justification", "innovation"]);
  });
  it("technical implementation judges score only the 10 correctness points", () => {
    const bad = good();
    bad.scores.technical_implementation = 25;
    assert.ok(!validateSheet(BEGINNER_CRITERIA, bad).ok);
  });
});

describe("moderation (10.6)", () => {
  const sheet = (judgeId: string, total: number, scores: Record<string, number> = {}) => ({ judgeId, total, scores });
  it("totals more than 15 apart need a third judge; exactly 15 does not", () => {
    assert.equal(needsThirdJudge(sheet("a", 80), sheet("b", 64.5), BEGINNER_CRITERIA), true);
    assert.equal(needsThirdJudge(sheet("a", 80), sheet("b", 65), BEGINNER_CRITERIA), false);
  });
  it("a criterion gap above 40% of its maximum triggers it", () => {
    const a = sheet("a", 50, { problem_understanding: 15 });
    const b = sheet("b", 50, { problem_understanding: 8 }); // gap 7 > 6
    assert.equal(needsThirdJudge(a, b, BEGINNER_CRITERIA), true);
    assert.equal(needsThirdJudge(a, sheet("c", 50, { problem_understanding: 9 }), BEGINNER_CRITERIA), false);
  });
  it("the Stage 1 judge score is the mean of the two closest of three", () => {
    const pair = closestPair([sheet("a", 90), sheet("b", 60), sheet("c", 64)]);
    assert.deepEqual(pair?.map((s) => s.judgeId), ["b", "c"]);
    const r = combineJudgeSheets([sheet("a", 90), sheet("b", 60), sheet("c", 64)], BEGINNER_CRITERIA);
    assert.equal(r.judgeMean, 62);
  });
  it("flags pending moderation and incomplete judging", () => {
    assert.equal(combineJudgeSheets([sheet("a", 80), sheet("b", 40)], BEGINNER_CRITERIA).moderationPending, true);
    assert.equal(combineJudgeSheets([sheet("a", 80)], BEGINNER_CRITERIA).incomplete, true);
  });
});

describe("script scores", () => {
  it("benchmark is normalised between baseline and reference and capped", () => {
    assert.equal(benchmarkPoints(0.5, 0.5, 0.9), 0);
    assert.equal(benchmarkPoints(0.7, 0.5, 0.9), 10);
    assert.equal(benchmarkPoints(0.95, 0.5, 0.9), 20);
    assert.equal(benchmarkPoints(0.1, 0.5, 0.9), 0);
    assert.equal(benchmarkPoints(0.7, 0.9, 0.9), 0);
  });
  it("requirements coverage is 15 points weighted equally", () => {
    assert.equal(requirementsPoints(6, 8), 11.25);
    assert.equal(requirementsPoints(0, 0), 0);
  });
});

describe("penalties (Section 13)", () => {
  it("are cumulative and come off Stage 1, floored at zero", () => {
    const p = computePenalties({ usedGrace: true, missedCheckpoints: 2, missingItems: 1, manual: [{ code: "identity_leak", points: 3 }] });
    assert.equal(p.total, 5 + 6 + 5 + 3);
    assert.equal(stage1Total(70, 10, p.total), 61);
    assert.equal(stage1Total(5, 0, 19), 0);
  });
  it("manual penalty ranges", () => {
    assert.ok(manualPenaltyValid("undeclared_third_party", 15));
    assert.ok(!manualPenaltyValid("undeclared_third_party", 16));
    assert.ok(!manualPenaltyValid("undeclared_ai", 4));
    assert.ok(!manualPenaltyValid("conduct_repeat", 5));
    assert.ok(!manualPenaltyValid("nonsense", 5));
  });
});

describe("ranking", () => {
  const team = (id: string, stage1: number, over: Partial<RankInput> = {}): RankInput => ({
    teamId: id, eligible: true, stage1, stage2: null, technical: 10, domain: 10, viva: null, ...over,
  });
  it("top 8 by Stage 1 are finalists and final = 0.6 S1 + 0.4 S2", () => {
    const teams = Array.from({ length: 10 }, (_, i) => team(`t${i}`, 90 - i, { stage2: 80 }));
    const ranked = rankTeams(teams);
    assert.equal(ranked.filter((r) => r.finalist).length, 8);
    assert.equal(ranked[0].final, 0.6 * 90 + 0.4 * 80);
    // Teams ranked 9 and below are ranked by S1 alone, below every finalist.
    assert.deepEqual(ranked.slice(8).map((r) => [r.teamId, r.final]), [["t8", 82], ["t9", 81]]);
  });
  it("a Stage 2 result can reorder finalists", () => {
    const ranked = rankTeams([team("a", 80, { stage2: 50 }), team("b", 78, { stage2: 90 })]);
    assert.equal(ranked[0].teamId, "b");
  });
  it("tie-breakers: technical, then domain, then viva, then jury vote", () => {
    const base = { stage2: 70 };
    let r = rankTeams([team("a", 80, { ...base, technical: 12 }), team("b", 80, { ...base, technical: 14 })]);
    assert.equal(r[0].teamId, "b");
    r = rankTeams([team("a", 80, { ...base, domain: 9 }), team("b", 80, { ...base, domain: 12 })]);
    assert.equal(r[0].teamId, "b");
    r = rankTeams([team("a", 80, { ...base, viva: 30 }), team("b", 80, { ...base, viva: 35 })]);
    assert.equal(r[0].teamId, "b");
    r = rankTeams([team("a", 80, { ...base, viva: 30 }), team("b", 80, { ...base, viva: 30 })]);
    assert.ok(r.every((x) => x.juryVoteRequired && x.rank === 1));
  });
  it("ineligible teams are left out", () => {
    assert.equal(rankTeams([team("a", 99, { eligible: false }), team("b", 50)]).length, 1);
  });
});

describe("assignJudges", () => {
  it("gives two judges per team, balances load and honours conflicts", () => {
    const judges = ["j1", "j2", "j3", "j4"].map((id) => ({ id, load: 0 }));
    const { assignments, unfilled } = assignJudges(["t1", "t2", "t3"], judges, new Set(["j1|t1"]), 2);
    assert.deepEqual(unfilled, []);
    assert.ok(!assignments.t1.includes("j1"));
    assert.ok(Object.values(assignments).every((a) => a.length === 2 && new Set(a).size === 2));
    const counts = Object.values(assignments).flat().reduce<Record<string, number>>((m, j) => ({ ...m, [j]: (m[j] ?? 0) + 1 }), {});
    assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1);
  });
  it("reports teams that cannot be filled", () => {
    const r = assignJudges(["t1"], [{ id: "j1", load: 0 }], new Set(), 2);
    assert.deepEqual(r.unfilled, ["t1"]);
  });
});
