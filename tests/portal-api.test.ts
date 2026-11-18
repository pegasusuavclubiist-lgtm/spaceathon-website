/* eslint-disable @typescript-eslint/no-explicit-any */
/** Route-level tests for the portal, judging and appeals against a fake Supabase. */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { GET as problemsGet } from "../app/api/portal/problems/route";
import { GET as problemFileGet } from "../app/api/portal/problems/[id]/route";
import { POST as declarationPost } from "../app/api/portal/declaration/route";
import { POST as checkpointPost } from "../app/api/portal/checkpoints/[n]/route";
import { POST as predictionPost } from "../app/api/portal/predictions/route";
import { POST as appealPost } from "../app/api/portal/appeals/route";
import { POST as ticketPost } from "../app/api/portal/tickets/route";
import { POST as scorePost } from "../app/api/judge/scores/route";
import { POST as disqualifyPost } from "../app/api/admin/teams/[id]/disqualify/route";
import { decodeHidden } from "../lib/watermark";
import { sha256Hex } from "../lib/security";
import { installFakeSupabase, restoreFetch, setEnv, type Call } from "./helpers";

const T0 = new Date("2026-12-14T10:00:00+05:30");
const at = (h: number) => new Date(T0.getTime() + h * 3600_000);
const KEY = "kmp_" + "a".repeat(43);
const JKEY = "kmj_" + "b".repeat(43);
const TEAM = "reg_" + "1".repeat(20);

/** Pretend "now" is `h` hours after kickoff by moving T0 instead of the clock. */
const setNow = (h: number) => setEnv({ EVENT_START_ISO: new Date(Date.now() - h * 3600_000).toISOString() });

beforeEach(() => setEnv());
afterEach(() => restoreFetch());

const body = async (r: Response) => (await r.json()) as Record<string, any>;
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const req = (url: string, init: { method?: string; key?: string; json?: unknown } = {}) =>
  new Request(`http://localhost${url}`, {
    method: init.method ?? (init.json ? "POST" : "GET"),
    headers: {
      "x-forwarded-for": "203.0.113.9",
      ...(init.key ? { authorization: `Bearer ${init.key}` } : {}),
      ...(init.json ? { "content-type": "application/json" } : {}),
    },
    ...(init.json ? { body: JSON.stringify(init.json) } : {}),
  });

const memberRow = (over: Record<string, unknown> = {}, teamOver: Record<string, unknown> = {}) => ({
  position: 0, full_name: "Asha Rao", email_key: "asha@iist.ac.in",
  pledge_signed_at: "2026-12-13T00:00:00Z", final_declaration_signed_at: null,
  teams: {
    id: TEAM, team_code: "B-001", team_name: "Orbital Originals", track: "Beginner",
    leader_email: "asha@iist.ac.in", verification_status: "verified", disqualified: false, grace_granted: false, repo_url: null,
    team_members: [{ position: 0, pledge_signed_at: "x", final_declaration_signed_at: null }, { position: 1, pledge_signed_at: null, final_declaration_signed_at: null }],
    ...teamOver,
  },
  ...over,
});

/** Fake that answers the member lookup (by the key's hash) and falls through for the rest. */
const withMember = (row: unknown, rest: (c: Call) => { status?: number; body?: unknown } | undefined = () => undefined) =>
  installFakeSupabase((c) => {
    if (c.path.includes("/rest/v1/team_members") && c.url.searchParams.get("portal_token_hash") === `eq.${sha256Hex(KEY)}`) {
      return { body: row ? [row] : [] };
    }
    return rest(c);
  });

describe("portal authentication", () => {
  it("rejects a missing, malformed or unknown key with 401", async () => {
    withMember(null);
    assert.equal((await problemsGet(req("/api/portal/problems"), ctx({}))).status, 401);
    assert.equal((await problemsGet(req("/api/portal/problems", { key: "nope" }), ctx({}))).status, 401);
    assert.equal((await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({}))).status, 401);
  });
  it("blocks unverified and disqualified teams", async () => {
    withMember(memberRow({}, { verification_status: "pending" }));
    assert.equal((await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({}))).status, 403);
    restoreFetch();
    withMember(memberRow({}, { disqualified: true }));
    assert.equal((await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({}))).status, 403);
  });
  it("only the stored hash of the key is ever sent to the database", async () => {
    const calls = withMember(memberRow());
    setNow(1);
    await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({}));
    assert.ok(!calls.some((c) => c.path.includes(KEY)));
  });
});

describe("pledge and problem release", () => {
  it("the pledge can be signed before T0 and not after", async () => {
    setNow(-5); // kickoff in 5 hours
    const calls = withMember(memberRow({ pledge_signed_at: null }), (c) => (c.method === "PATCH" ? { body: [{ id: 1 }] } : undefined));
    const ok = await declarationPost(req("/api/portal/declaration", { key: KEY, json: { kind: "pledge", accepted: true } }), ctx({}));
    assert.equal(ok.status, 200);
    const patch = calls.find((c) => c.method === "PATCH") as Call;
    assert.ok((patch.json as any).pledge_signed_at);
    restoreFetch();
    setNow(1);
    withMember(memberRow({ pledge_signed_at: null }));
    assert.equal((await declarationPost(req("/api/portal/declaration", { key: KEY, json: { kind: "pledge", accepted: true } }), ctx({}))).status, 403);
  });
  it("the declaration must be explicitly accepted", async () => {
    setNow(-5);
    withMember(memberRow());
    assert.equal((await declarationPost(req("/api/portal/declaration", { key: KEY, json: { kind: "pledge", accepted: false } }), ctx({}))).status, 422);
  });
  it("statements are sealed before T0 and without a pledge, then released with a team seed", async () => {
    setNow(-1);
    withMember(memberRow());
    assert.equal((await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({}))).status, 403);
    restoreFetch();
    setNow(1);
    withMember(memberRow({ pledge_signed_at: null }));
    assert.equal((await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({}))).status, 403);
    restoreFetch();
    withMember(memberRow(), (c) => c.path.includes("/rest/v1/problem_files")
      ? { body: [{ id: "prob_" + "2".repeat(20), kind: "statement", name: "p.md", content_type: "text/markdown", size_bytes: 10, sha256: "h" }] } : undefined);
    const res = await body(await problemsGet(req("/api/portal/problems", { key: KEY }), ctx({})));
    assert.equal(res.data.files.length, 1);
    assert.match(res.data.seed, /^[0-9a-f]{8}$/);
  });
  it("serves a watermarked statement and logs the download", async () => {
    setNow(1);
    const id = "prob_" + "2".repeat(20);
    const calls = withMember(memberRow(), (c) => {
      if (c.path.includes("/rest/v1/problem_files")) return { body: [{ id, name: "statement.md", content_type: "text/markdown", object_path: "Beginner/x", size_bytes: 20 }] };
      if (c.path.includes("/rest/v1/download_log")) return { body: [{ id: 1 }] };
      if (c.path.includes("/storage/v1/object/problems/")) return { body: "# Problem" };
    });
    // The fake JSON-encodes bodies, so the text arrives quoted; the watermark is what matters.
    const res = await problemFileGet(req(`/api/portal/problems/${id}`, { key: KEY }), ctx({ id }));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /Team ID: B-001/);
    assert.equal(decodeHidden(text), "B-001");
    const log = calls.find((c) => c.path.includes("/download_log")) as Call;
    assert.equal((log.json as any).team_id, TEAM);
    assert.equal((log.json as any).watermarked, true);
  });
});

describe("checkpoints and tickets", () => {
  const note = "We built the ingest pipeline and the first dashboard view this session and verified units against the reference values.";
  it("accepts a note before the checkpoint and refuses it after", async () => {
    setNow(5);
    const calls = withMember(memberRow(), (c) => {
      if (c.path.includes("/rest/v1/checkpoints") && c.method === "GET") return { body: [] };
      if (c.path.includes("/rest/v1/checkpoints") && c.method === "POST") return { body: [{ n: 1 }] };
    });
    const ok = await checkpointPost(req("/api/portal/checkpoints/1", { key: KEY, json: { note, commitSha: "abc1234" } }), ctx({ n: "1" }));
    assert.equal(ok.status, 200);
    assert.equal(((calls.find((c) => c.method === "POST" && c.path.includes("/checkpoints")) as Call).json as any).repo_sha, "abc1234");
    restoreFetch();
    setNow(13);
    withMember(memberRow());
    assert.equal((await checkpointPost(req("/api/portal/checkpoints/1", { key: KEY, json: { note } }), ctx({ n: "1" }))).status, 403);
  });
  it("checkpoint 2 is a live check-in, not an upload", async () => {
    setNow(23);
    withMember(memberRow());
    assert.equal((await checkpointPost(req("/api/portal/checkpoints/2", { key: KEY, json: { note } }), ctx({ n: "2" }))).status, 422);
  });
  it("an upload-failure ticket inside the window grants the 10-minute grace", async () => {
    setNow(45);
    const calls = withMember(memberRow(), (c) => {
      if (c.path.includes("/support_tickets")) return { body: [{ id: "x" }] };
      if (c.method === "PATCH") return { body: [{ id: TEAM }] };
    });
    const res = await ticketPost(req("/api/portal/tickets", { key: KEY, json: { kind: "upload_failure", subject: "Upload stuck", body: "The report upload fails at 90%." } }), ctx({}));
    assert.equal(res.status, 201);
    assert.equal((await body(res)).data.graceGranted, true);
    assert.equal(((calls.find((c) => c.method === "PATCH") as Call).json as any).grace_granted, true);
  });
});

describe("prediction cap", () => {
  it("refuses the 6th upload within 12 hours with 429 and Retry-After", async () => {
    setNow(10);
    const recent = [1, 2, 3, 4, 5].map((h) => ({ uploaded_at: new Date(Date.now() - h * 3600_000).toISOString() }));
    withMember(memberRow({}, { track: "Advanced" }), (c) => c.path.includes("/prediction_uploads") ? { body: recent } : undefined);
    const res = await predictionPost(req("/api/portal/predictions", { key: KEY, json: { objectPath: `${TEAM}/predictions/u1` } }), ctx({}));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), String(7 * 3600));
  });
  it("is Advanced-only", async () => {
    setNow(10);
    withMember(memberRow());
    assert.equal((await predictionPost(req("/api/portal/predictions", { key: KEY, json: { objectPath: "x" } }), ctx({}))).status, 404);
  });
});

describe("appeals", () => {
  const input = { ground: "arithmetic_error", description: "The criterion scores add up to 71 but the total shown is 64, so the sum is wrong." };
  it("is leader-only, windowed to T+102..T+126, and one per team", async () => {
    setNow(110);
    withMember(memberRow({ email_key: "vihaan@iitm.ac.in", position: 1 }));
    assert.equal((await appealPost(req("/api/portal/appeals", { key: KEY, json: input }), ctx({}))).status, 403);
    restoreFetch();

    setNow(100);
    withMember(memberRow());
    assert.equal((await appealPost(req("/api/portal/appeals", { key: KEY, json: input }), ctx({}))).status, 403);
    restoreFetch();

    setNow(110);
    withMember(memberRow(), (c) => c.path.includes("/rest/v1/appeals") ? (c.method === "POST" ? { body: [{ id: "a" }] } : { body: [] }) : undefined);
    assert.equal((await appealPost(req("/api/portal/appeals", { key: KEY, json: input }), ctx({}))).status, 201);
    restoreFetch();

    withMember(memberRow(), (c) => c.path.includes("/rest/v1/appeals") ? { body: [{ id: "existing" }] } : undefined);
    assert.equal((await appealPost(req("/api/portal/appeals", { key: KEY, json: input }), ctx({}))).status, 409);
  });
  it("rejects a subjective ground", async () => {
    setNow(110);
    withMember(memberRow());
    const res = await appealPost(req("/api/portal/appeals", { key: KEY, json: { ...input, ground: "unfair_score" } }), ctx({}));
    assert.equal(res.status, 422);
    assert.ok((await body(res)).error.fieldErrors.ground);
  });
});

describe("judge scoring", () => {
  const judgeRow = (role = "judge") => ({ id: "jdg_1", name: "J", role, tracks: ["Beginner"] });
  const sheet = () => {
    const scores: Record<string, number> = {}; const justifications: Record<string, string> = {};
    for (const k of ["problem_understanding", "domain_accuracy", "innovation", "code_quality", "demo_communication", "process_learning"]) { scores[k] = 5; justifications[k] = "fine"; }
    scores.technical_implementation = 8; justifications.technical_implementation = "works";
    return { teamCode: "B-001", stage: 1, scores, justifications };
  };
  const fake = (over: { assigned?: boolean; conflict?: boolean; existing?: boolean; role?: string } = {}) =>
    installFakeSupabase((c) => {
      if (c.path.includes("/rest/v1/judges")) return { body: [judgeRow(over.role)] };
      if (c.path.includes("/rest/v1/teams")) return { body: [{ id: TEAM, track: "Beginner" }] };
      if (c.path.includes("/rest/v1/judge_assignments")) return { body: over.assigned === false ? [] : [{ team_id: TEAM }] };
      if (c.path.includes("/rest/v1/judge_conflicts")) return { body: over.conflict ? [{ team_id: TEAM }] : [] };
      if (c.path.includes("/rest/v1/score_sheets") && c.method === "GET") return { body: over.existing ? [{ id: 1 }] : [] };
      if (c.path.includes("/rest/v1/score_sheets") && c.method === "POST") return { body: [{ id: 7 }] };
      if (c.path.endsWith("/rpc/ledger_append")) return { body: { id: 1, hash: "h" } };
    });
  const post = (json: unknown) => scorePost(req("/api/judge/scores", { key: JKEY, json }), ctx({}));

  it("stores a locked sheet with the judge-scored total and appends to the ledger", async () => {
    const calls = fake();
    const res = await post(sheet());
    assert.equal(res.status, 201);
    const stored = (calls.find((c) => c.method === "POST" && c.path.includes("/score_sheets")) as Call).json as any;
    assert.equal(stored.total, 38); // 6 x 5 + 8
    assert.ok(calls.some((c) => c.path.endsWith("/rpc/ledger_append")));
  });
  it("refuses unassigned teams, conflicts of interest and a second sheet", async () => {
    fake({ assigned: false }); assert.equal((await post(sheet())).status, 403); restoreFetch();
    fake({ conflict: true }); assert.equal((await post(sheet())).status, 403); restoreFetch();
    fake({ existing: true }); assert.equal((await post(sheet())).status, 409);
  });
  it("rejects scores above a criterion's judge maximum", async () => {
    fake();
    const bad = sheet(); bad.scores.technical_implementation = 25;
    const res = await post(bad);
    assert.equal(res.status, 422);
    assert.ok((await body(res)).error.fieldErrors.technical_implementation);
  });
  it("keeps Stage 2 for the Grand Jury and Stage 1 for judges", async () => {
    fake({ role: "grand_jury" }); assert.equal((await post(sheet())).status, 403); restoreFetch();
    fake(); assert.equal((await post({ ...sheet(), stage: 2 })).status, 403);
  });
});

describe("admin roles", () => {
  it("a technical token cannot disqualify; an oc token can", async () => {
    setEnv({ ADMIN_TOKENS: "Ravi:technical:rtok;Asha:oc:atok" });
    installFakeSupabase((c) => (c.method === "PATCH" ? { body: [{ id: TEAM }] } : c.path.endsWith("/rpc/ledger_append") ? { body: { id: 1, hash: "h" } } : undefined));
    const call = (token: string) =>
      disqualifyPost(new Request("http://localhost/x", {
        method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-forwarded-for": "1.1.1.1" },
        body: JSON.stringify({ reason: "Pre-built solution found in commit history." }),
      }), ctx({ id: TEAM }));
    assert.equal((await call("rtok")).status, 403);
    assert.equal((await call("nope")).status, 401);
    assert.equal((await call("atok")).status, 200);
  });
});
