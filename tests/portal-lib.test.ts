import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countWords, missedCheckpoints, validateNote } from "../lib/checkpoints";
import { predictionWait } from "../lib/eval";
import { buildManifest, missingItems } from "../lib/manifest";
import { getMilestones, predictionGate, submissionGate, appealGate } from "../lib/schedule";
import { screenTeam } from "../lib/stage0";
import { sniffItem } from "../lib/submission-service";
import { decodeHidden, encodeHidden, injectCanary, traceLeak, watermarkText } from "../lib/watermark";
import { parseAdminTokens, type BackendConfig } from "../lib/config";

const t0 = new Date("2026-12-14T10:00:00+05:30");
const cfg = { eventStart: t0 } as BackendConfig;
const at = (h: number) => new Date(t0.getTime() + h * 3600_000);

describe("schedule", () => {
  it("derives milestones from T0", () => {
    const m = getMilestones(cfg)!;
    assert.equal(m.hardClose.getTime(), at(48).getTime());
    assert.equal(m.graceEnds.getTime(), at(48).getTime() + 600_000);
    assert.equal(m.briefingAt.toISOString(), "2026-12-13T12:30:00.000Z"); // D-1 18:00 IST
    assert.equal(getMilestones({ eventStart: null } as BackendConfig), null);
  });
  it("submission window T+40..T+48, with grace only when granted", () => {
    assert.equal(submissionGate(cfg, false, at(39.9)).open, false);
    assert.deepEqual(submissionGate(cfg, false, at(40)), { open: true, inGrace: false });
    assert.equal(submissionGate(cfg, false, at(48.05)).open, false);
    assert.deepEqual(submissionGate(cfg, true, at(48.05)), { open: true, inGrace: true });
    assert.equal(submissionGate(cfg, true, at(48.2)).open, false);
  });
  it("fails closed with no date; appeals T+102..T+126; predictions T0..T+48", () => {
    assert.equal(predictionGate({ eventStart: null } as BackendConfig).open, false);
    assert.equal(appealGate(cfg, at(101)).open, false);
    assert.equal(appealGate(cfg, at(110)).open, true);
    assert.equal(appealGate(cfg, at(126)).open, false);
    assert.equal(predictionGate(cfg, at(10)).open, true);
    assert.equal(predictionGate(cfg, at(49)).open, false);
  });
});

describe("checkpoints", () => {
  it("counts words and enforces the 200-word limit", () => {
    assert.equal(countWords("  a b\nc  "), 3);
    assert.ok(validateNote("word ".repeat(200), undefined).ok);
    assert.ok(!validateNote("word ".repeat(201), undefined).ok);
    assert.ok(!validateNote("too short", undefined).ok);
    assert.ok(!validateNote("word ".repeat(20), "not-a-sha").ok);
  });
  it("checkpoint 2 only counts with every member present", () => {
    assert.equal(missedCheckpoints([{ n: 1 }, { n: 2, present_positions: [0, 1] }, { n: 3 }], 2), 0);
    assert.equal(missedCheckpoints([{ n: 1 }, { n: 2, present_positions: [0] }, { n: 3 }], 2), 1);
    assert.equal(missedCheckpoints([], 3), 3);
  });
});

describe("prediction cap (12.2)", () => {
  const now = new Date("2026-12-14T20:00:00Z");
  const ago = (h: number) => new Date(now.getTime() - h * 3600_000);
  it("allows 5 per rolling 12 hours and says when the next slot frees", () => {
    assert.equal(predictionWait([ago(1), ago(2), ago(3), ago(4)], now), 0);
    const wait = predictionWait([ago(1), ago(2), ago(3), ago(4), ago(5)], now);
    assert.equal(wait, 7 * 3600); // oldest (5h ago) leaves the window in 7h
    assert.equal(predictionWait([ago(13), ago(2), ago(3), ago(4), ago(5)], now), 0);
  });
});

describe("manifest and completeness", () => {
  it("manifest hash is stable and changes when any item changes", () => {
    const base = { teamCode: "A-001", track: "Advanced" as const, hardCloseISO: "x", repo: { url: "https://r", commitSha: "abc1234" }, membersSigned: 2, memberCount: 2 };
    const a = buildManifest({ ...base, items: [{ item: "report", sha256: "1", size: 1 }, { item: "demo", sha256: "2", size: 2 }] });
    const reordered = buildManifest({ ...base, items: [{ item: "demo", sha256: "2", size: 2 }, { item: "report", sha256: "1", size: 1 }] });
    const changed = buildManifest({ ...base, items: [{ item: "report", sha256: "9", size: 1 }, { item: "demo", sha256: "2", size: 2 }] });
    assert.equal(a.sha256, reordered.sha256);
    assert.notEqual(a.sha256, changed.sha256);
  });
  it("each missing item is listed; Advanced also needs predictions and a Dockerfile", () => {
    const repo = { commitSha: "abc1234", hasReadme: true, hasEnvFile: true, hasDockerfile: false };
    const m = missingItems("Advanced", new Set(["report", "demo"]), repo, 1, 2);
    assert.deepEqual(m.sort(), ["declaration", "dockerfile", "predictions"]);
    assert.deepEqual(missingItems("Beginner", new Set(["report", "demo"]), { commitSha: "a", hasReadme: true, hasEnvFile: true }, 2, 2), []);
    assert.ok(missingItems("Beginner", new Set(), null, 0, 2).includes("repo_snapshot"));
  });
});

describe("stage 0", () => {
  const base = {
    t0, checkpoints: [{ n: 1 as const, at: at(12) }, { n: 2 as const, at: at(24) }, { n: 3 as const, at: at(36) }],
    hasRepoSnapshot: true, hasManifest: true, firstCommitAt: at(1),
    commits: [at(2), at(14), at(30), at(40)].map((a) => ({ at: a, additions: 100 })),
    maxSimilarityPercent: 5, copiedReportText: false,
  };
  it("passes a clean team", () => assert.deepEqual(screenTeam(base), { passed: true, issues: [], reviews: [] }));
  it("fails a commit before T0 and no snapshot", () => {
    assert.deepEqual(screenTeam({ ...base, firstCommitAt: at(-1) }).issues, ["commit_before_t0"]);
    assert.ok(screenTeam({ ...base, hasRepoSnapshot: false }).issues.includes("no_working_repository_snapshot"));
  });
  it("flags one commit over 50% and long commit gaps for review without failing", () => {
    const r = screenTeam({ ...base, commits: [{ at: at(2), additions: 900 }, { at: at(40), additions: 100 }] });
    assert.equal(r.passed, true);
    assert.ok(r.reviews.includes("single_commit_over_50_percent"));
    assert.ok(r.reviews.includes("no_commits_across_two_checkpoints"));
  });
  it("similarity: 40% reviews, over 70% fails", () => {
    assert.ok(screenTeam({ ...base, maxSimilarityPercent: 40 }).reviews.includes("similarity_40_percent_or_more"));
    assert.equal(screenTeam({ ...base, maxSimilarityPercent: 71 }).passed, false);
  });
});

describe("file sniffing", () => {
  it("recognises PDF, MP4/MOV, WebM and PPTX by content, not name", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7");
    assert.equal(sniffItem("report", pdf), "application/pdf");
    assert.equal(sniffItem("demo", pdf), null);
    const mp4 = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    assert.equal(sniffItem("demo", mp4), "video/mp4");
    assert.equal(sniffItem("demo", Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 1])), "video/webm");
    assert.equal(sniffItem("deck", Uint8Array.from([0x50, 0x4b, 3, 4])), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
    assert.equal(sniffItem("report", Uint8Array.from([0x50, 0x4b, 3, 4])), null);
  });
});

describe("watermarks and canaries (5.8)", () => {
  it("hidden watermark round-trips and survives a footer", () => {
    assert.equal(decodeHidden(encodeHidden("B-017")), "B-017");
    const marked = watermarkText("# Problem\nSolve it.", "A-004", "statement.md");
    assert.match(marked, /Team ID: A-004/);
    assert.equal(decodeHidden(marked), "A-004");
    assert.match(watermarkText("<html><body>x</body></html>", "A-004", "s.html"), /<footer>Team ID: A-004/);
  });
  const csv = ["id,x,y,label"].concat(Array.from({ length: 60 }, (_, i) => `${i},${(i * 1.1234567).toFixed(6)},${(i / 7).toFixed(5)},ok`)).join("\n");
  it("canaries are deterministic per team, tiny, and differ between teams", () => {
    const a1 = injectCanary(csv, "seed-a");
    const a2 = injectCanary(csv, "seed-a");
    const b = injectCanary(csv, "seed-b");
    assert.equal(a1.content, a2.content);
    assert.notEqual(a1.content, b.content);
    assert.equal(a1.canaries.length, 3);
    for (const k of a1.canaries) {
      assert.equal(k.original.slice(0, -1), k.value.slice(0, -1)); // only the last digit moved
      assert.notEqual(k.original, k.value);
    }
    assert.equal(a1.content.split("\n").length, csv.split("\n").length);
  });
  it("a leaked copy traces back to the right team", () => {
    const leaked = injectCanary(csv, "seed-b").content;
    const ranked = traceLeak(csv, leaked, [{ teamCode: "B-001", seedHex: "seed-a" }, { teamCode: "B-002", seedHex: "seed-b" }, { teamCode: "B-003", seedHex: "seed-c" }]);
    assert.equal(ranked[0].teamCode, "B-002");
    assert.equal(ranked[0].matched, ranked[0].expected);
    assert.ok(ranked[1].matched < ranked[1].expected);
  });
  it("leaves files without suitable numeric cells untouched", () => {
    assert.equal(injectCanary("a,b\n1,2\n3,4", "s").canaries.length, 0);
  });
});

describe("admin tokens", () => {
  it("parses named role tokens and skips malformed entries", () => {
    assert.deepEqual(parseAdminTokens("Asha:oc:tok1;Ravi:technical:tok2;bad:nope:tok3;:oc:x"), [
      { actor: "Asha", role: "oc", token: "tok1" }, { actor: "Ravi", role: "technical", token: "tok2" },
    ]);
    assert.deepEqual(parseAdminTokens(null), []);
  });
});
