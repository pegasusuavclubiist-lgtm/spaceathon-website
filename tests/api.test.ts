/* eslint-disable @typescript-eslint/no-explicit-any */
/** Route-level tests against a fake Supabase (global fetch is replaced). */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { POST as contactPost } from "../app/api/contact/route";
import { PATCH as adminPatch } from "../app/api/admin/registrations/[id]/route";
import { GET as adminList } from "../app/api/admin/registrations/route";
import { POST as registerPost } from "../app/api/register/route";
import { POST as uploadPost } from "../app/api/register/[id]/college-id/route";
import { GET as retention } from "../app/api/cron/retention/route";
import { sha256Hex } from "../lib/security";
import {
  installFakeSupabase,
  jsonRequest,
  restoreFetch,
  setEnv,
  validRegistration,
  type Call,
} from "./helpers";

beforeEach(() => setEnv());
afterEach(() => restoreFetch());

const URL_REGISTER = "http://localhost/api/register";
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;
const body = async (res: Response) => (await res.json()) as Record<string, any>;

describe("POST /api/register", () => {
  it("creates a team and returns a one-time upload grant (201)", async () => {
    const calls = installFakeSupabase((c) =>
      c.path.endsWith("/rpc/register_team")
        ? { body: { id: "x", created_at: "2026-11-16T09:30:00Z" } }
        : undefined,
    );

    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 201);
    const { data } = await body(res);
    assert.match(data.id, /^reg_[0-9a-f]{20}$/);
    assert.equal(data.teamName, "Orbital Originals");
    assert.equal(data.memberCount, 2);
    assert.equal(data.verificationStatus, "pending");
    assert.equal(data.collegeIdUpload.url, `/api/register/${data.id}/college-id`);

    // Only the hash of the token is stored; the token itself never reaches the DB.
    const rpcCall = calls.find((c) => c.path.endsWith("/rpc/register_team")) as Call;
    const team = (rpcCall.json as any).p_team;
    assert.equal(team.upload_token_hash, sha256Hex(data.collegeIdUpload.token));
    assert.ok(!JSON.stringify(rpcCall.json).includes(data.collegeIdUpload.token));
    // The service role key is used server-side.
    assert.equal(rpcCall.headers.get("apikey"), "service-key");
  });

  it("returns 403 when registration is closed, before touching the body", async () => {
    setEnv({ REGISTRATION_OPEN: "false" });
    installFakeSupabase(() => undefined);
    const res = await registerPost(jsonRequest(URL_REGISTER, {}));
    assert.equal(res.status, 403);
    assert.match((await body(res)).error.message, /not open/);
  });

  it("returns 403 after the D-5 close once the date is known", async () => {
    setEnv({ EVENT_START_ISO: "2026-11-20T10:00:00+05:30" }); // closes 16 Nov 00:00 IST
    installFakeSupabase(() => undefined);
    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 403);
    assert.match((await body(res)).error.message, /closed/);
  });

  it("returns 422 with fieldErrors for rule violations", async () => {
    installFakeSupabase(() => undefined);
    const bad = validRegistration();
    bad.members[1].programme = "PhD";
    const res = await registerPost(jsonRequest(URL_REGISTER, bad));
    assert.equal(res.status, 422);
    const { error } = await body(res);
    assert.ok(error.fieldErrors.track);
    assert.ok(error.fieldErrors["members.1.programme"]);
  });

  it("returns 400 for malformed JSON, 415 for the wrong content type, 413 for big bodies", async () => {
    installFakeSupabase(() => undefined);
    const headers = { "content-type": "application/json" };
    assert.equal(
      (await registerPost(new Request(URL_REGISTER, { method: "POST", headers, body: "{nope" }))).status,
      400,
    );
    assert.equal(
      (await registerPost(new Request(URL_REGISTER, { method: "POST", body: "hi" }))).status,
      415,
    );
    const huge = JSON.stringify({ teamName: "x".repeat(40_000) });
    assert.equal(
      (await registerPost(new Request(URL_REGISTER, { method: "POST", headers, body: huge }))).status,
      413,
    );
  });

  it("maps a duplicate member email to 409 on that member (rulebook 3.4)", async () => {
    installFakeSupabase((c) =>
      c.path.endsWith("/rpc/register_team")
        ? {
            status: 409,
            body: {
              code: "23505",
              message: 'duplicate key value violates unique constraint "team_members_email_unique"',
              details: "Key (email_key)=(vihaan.me@iitm.ac.in) already exists.",
            },
          }
        : undefined,
    );
    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 409);
    const { error } = await body(res);
    assert.deepEqual(Object.keys(error.fieldErrors), ["members.1.email"]);
  });

  it("replays an identical retry shortly after creation with a fresh token", async () => {
    let stored = "";
    const calls = installFakeSupabase((c) => {
      if (c.path.endsWith("/rpc/register_team")) {
        stored = (c.json as any).p_team.payload_hash;
        return {
          status: 409,
          body: { code: "23505", message: 'violates unique constraint "teams_name_unique"', details: "" },
        };
      }
      if (c.method === "GET" && c.path.includes("/rest/v1/teams")) {
        return { body: [{ id: "reg_aaaaaaaaaaaaaaaaaaaa", payload_hash: stored, created_at: new Date().toISOString() }] };
      }
      if (c.method === "PATCH" && c.path.includes("/rest/v1/teams")) return { body: [{ id: "reg_aaaaaaaaaaaaaaaaaaaa" }] };
    });
    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 200);
    const { data } = await body(res);
    assert.equal(data.id, "reg_aaaaaaaaaaaaaaaaaaaa");
    const patch = calls.find((c) => c.method === "PATCH") as Call;
    assert.equal((patch.json as any).upload_token_hash, sha256Hex(data.collegeIdUpload.token));
  });

  it("returns 409 for a genuine duplicate team name", async () => {
    installFakeSupabase((c) => {
      if (c.path.endsWith("/rpc/register_team")) {
        return { status: 409, body: { code: "23505", message: 'violates unique constraint "teams_name_unique"' } };
      }
      if (c.method === "GET" && c.path.includes("/rest/v1/teams")) {
        return { body: [{ id: "reg_bbbbbbbbbbbbbbbbbbbb", payload_hash: "different", created_at: "2026-01-01T00:00:00Z" }] };
      }
    });
    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 409);
    assert.ok((await body(res)).error.fieldErrors.teamName);
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    installFakeSupabase((c) =>
      c.path.endsWith("/rpc/rate_limit_hit") ? { body: { allowed: false, retry_after: 42 } } : undefined,
    );
    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "42");
  });

  it("answers 503 when Supabase is not configured, and 500 without leaking details", async () => {
    setEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined });
    assert.equal((await registerPost(jsonRequest(URL_REGISTER, validRegistration()))).status, 503);

    setEnv();
    installFakeSupabase((c) =>
      c.path.endsWith("/rpc/register_team") ? { status: 500, body: { message: "secret db detail" } } : undefined,
    );
    const res = await registerPost(jsonRequest(URL_REGISTER, validRegistration()));
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(await body(res)).includes("secret"));
  });
});

describe("POST /api/contact", () => {
  const payload = { name: "Asha", email: "asha@iist.ac.in", topic: "General question", message: "Hello" };

  it("stores a message and returns 201", async () => {
    const calls = installFakeSupabase((c) =>
      c.path.includes("/rest/v1/contact_messages") ? { body: [{ created_at: "2026-11-16T09:30:00Z" }] } : undefined,
    );
    const res = await contactPost(jsonRequest("http://localhost/api/contact", payload));
    assert.equal(res.status, 201);
    const { data } = await body(res);
    assert.match(data.id, /^msg_[0-9a-f]{20}$/);
    const insert = calls.find((c) => c.path.includes("/contact_messages")) as Call;
    // The raw IP is never stored, only a hash.
    assert.ok(!JSON.stringify(insert.json).includes("203.0.113.9"));
  });

  it("silently drops honeypot spam without storing it", async () => {
    const calls = installFakeSupabase(() => undefined);
    const res = await contactPost(jsonRequest("http://localhost/api/contact", { ...payload, website: "x" }));
    assert.equal(res.status, 201);
    assert.ok(!calls.some((c) => c.path.includes("/contact_messages")));
  });

  it("validates input with 422", async () => {
    installFakeSupabase(() => undefined);
    const res = await contactPost(jsonRequest("http://localhost/api/contact", { ...payload, topic: "Nope" }));
    assert.equal(res.status, 422);
  });
});

describe("POST /api/register/{id}/college-id", () => {
  const ID = "reg_aaaaaaaaaaaaaaaaaaaa";
  const TOKEN = "good-token";

  function upload(file: Blob, opts: { index?: string; token?: string } = {}) {
    const form = new FormData();
    form.set("memberIndex", opts.index ?? "0");
    form.set("file", file, "id.pdf");
    return uploadPost(
      new Request(`http://localhost/api/register/${ID}/college-id`, {
        method: "POST",
        headers: { authorization: `Bearer ${opts.token ?? TOKEN}`, "x-forwarded-for": "203.0.113.9" },
        body: form,
      }),
      ctx({ id: ID }),
    );
  }

  const fakeDb = (status = "pending") => (c: Call) => {
    if (c.method === "GET" && c.path.includes("/rest/v1/teams?")) {
      return { body: [{ id: ID, upload_token_hash: sha256Hex(TOKEN), verification_status: status }] };
    }
    if (c.method === "GET" && c.path.includes("is.null")) return { body: [{ id: 2 }] };
    if (c.method === "GET" && c.path.includes("/rest/v1/team_members")) return { body: [{ id: 1, id_object_path: null }] };
    if (c.method === "POST" && c.path.includes("/storage/v1/object/college-ids/")) return { body: {} };
    if (c.method === "PATCH") return { body: [{ id: 1 }] };
  };

  const pdf = () => new Blob([Buffer.from("%PDF-1.7 test")], { type: "application/pdf" });

  it("stores a valid ID privately and reports how many are still missing", async () => {
    const calls = installFakeSupabase(fakeDb());
    const res = await upload(pdf());
    assert.equal(res.status, 200);
    assert.deepEqual((await body(res)).data, { memberIndex: 0, uploaded: true, membersMissingId: 1 });
    const stored = calls.find((c) => c.method === "POST" && c.path.includes("/storage/"));
    assert.match(stored!.path, new RegExp(`/college-ids/${ID}/0-[0-9a-f]{12}\\.pdf$`));
  });

  it("rejects the wrong token with 401 and does not store anything", async () => {
    const calls = installFakeSupabase(fakeDb());
    const res = await upload(pdf(), { token: "bad" });
    assert.equal(res.status, 401);
    assert.ok(!calls.some((c) => c.path.includes("/storage/")));
  });

  it("rejects files whose content is not an image or PDF, whatever the name says", async () => {
    installFakeSupabase(fakeDb());
    const res = await upload(new Blob(["<html>not an id</html>"], { type: "application/pdf" }));
    assert.equal(res.status, 422);
    assert.ok((await body(res)).error.fieldErrors["members.0.collegeId"]);
  });

  it("rejects oversized and empty files", async () => {
    setEnv({ MAX_ID_BYTES: "1024" });
    installFakeSupabase(fakeDb());
    assert.equal((await upload(new Blob([Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2000)])]))).status, 422);
    assert.equal((await upload(new Blob([]))).status, 422);
  });

  it("rejects bad member indexes", async () => {
    installFakeSupabase(fakeDb());
    assert.equal((await upload(pdf(), { index: "7" })).status, 422);
  });

  it("blocks uploads after the D-3 team lock (rulebook 3.6)", async () => {
    setEnv({ EVENT_START_ISO: "2026-11-18T10:00:00+05:30" }); // lock = 15 Nov 00:00 IST, already passed
    installFakeSupabase(fakeDb());
    assert.equal((await upload(pdf())).status, 403);
  });

  it("blocks uploads for an already verified team", async () => {
    installFakeSupabase(fakeDb("verified"));
    assert.equal((await upload(pdf())).status, 409);
  });
});

describe("admin API", () => {
  const auth = (extra: Record<string, string> = {}) => ({
    authorization: "Bearer admin-secret",
    "x-admin-actor": "Priya (OC)",
    "x-forwarded-for": "198.51.100.4",
    ...extra,
  });

  it("requires the bearer token", async () => {
    installFakeSupabase(() => undefined);
    const res = await adminList(new Request("http://localhost/api/admin/registrations"));
    assert.equal(res.status, 401);
    const wrong = await adminList(
      new Request("http://localhost/api/admin/registrations", { headers: { authorization: "Bearer nope" } }),
    );
    assert.equal(wrong.status, 401);
  });

  it("is disabled (503) when no admin token is configured", async () => {
    setEnv({ ADMIN_API_TOKEN: undefined });
    installFakeSupabase(() => undefined);
    const res = await adminList(new Request("http://localhost/api/admin/registrations", { headers: auth() }));
    assert.equal(res.status, 503);
  });

  it("throttles repeated bad tokens with 429", async () => {
    installFakeSupabase((c) =>
      c.path.endsWith("/rpc/rate_limit_hit") ? { body: { allowed: false, retry_after: 600 } } : undefined,
    );
    const res = await adminList(
      new Request("http://localhost/api/admin/registrations", { headers: { authorization: "Bearer nope" } }),
    );
    assert.equal(res.status, 429);
  });

  it("requires an actor name for the audit trail", async () => {
    installFakeSupabase(() => undefined);
    const res = await adminList(
      new Request("http://localhost/api/admin/registrations", { headers: { authorization: "Bearer admin-secret" } }),
    );
    assert.equal(res.status, 400);
  });

  it("lists registrations with filters and total", async () => {
    const calls = installFakeSupabase((c) =>
      c.path.includes("/rest/v1/teams") ? { body: [{ id: "reg_x" }] } : undefined,
    );
    const res = await adminList(
      new Request("http://localhost/api/admin/registrations?status=pending&track=Beginner", { headers: auth() }),
    );
    assert.equal(res.status, 200);
    const q = calls.find((c) => c.path.includes("/rest/v1/teams")) as Call;
    assert.equal(q.url.searchParams.get("verification_status"), "eq.pending");
    assert.equal(q.url.searchParams.get("track"), "eq.Beginner");
    assert.ok(!(q.url.searchParams.get("select") ?? "").includes("upload_token_hash"));
  });

  const ID = "reg_aaaaaaaaaaaaaaaaaaaa";
  const team = (missing: boolean) => ({
    id: ID,
    verification_status: "pending",
    team_members: [
      { position: 0, id_uploaded_at: "2026-11-16T00:00:00Z" },
      { position: 1, id_uploaded_at: missing ? null : "2026-11-16T00:00:00Z" },
    ],
  });
  const patchReq = (payload: unknown) =>
    adminPatch(
      new Request(`http://localhost/api/admin/registrations/${ID}`, {
        method: "PATCH",
        headers: { ...auth(), "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      ctx({ id: ID }),
    );

  it("will not verify a team with missing IDs (409)", async () => {
    installFakeSupabase((c) => (c.method === "GET" && c.path.includes("/rest/v1/teams") ? { body: [team(true)] } : undefined));
    assert.equal((await patchReq({ verificationStatus: "verified" })).status, 409);
  });

  it("requires a reason to reject (422)", async () => {
    installFakeSupabase((c) => (c.method === "GET" && c.path.includes("/rest/v1/teams") ? { body: [team(false)] } : undefined));
    assert.equal((await patchReq({ verificationStatus: "rejected" })).status, 422);
  });

  it("verifies a complete team, activates the portal and writes an audit entry", async () => {
    const calls = installFakeSupabase((c) => {
      if (c.path.endsWith("/rpc/assign_team_code")) return { body: "B-001" };
      if (c.method === "GET" && c.path.includes("/rest/v1/team_members")) {
        return { body: [{ position: 0, full_name: "Asha", email: "asha@iist.ac.in" }, { position: 1, full_name: "Vihaan", email: "v@iitm.ac.in" }] };
      }
      if (c.method === "GET" && c.path.includes("/rest/v1/teams")) return { body: [team(false)] };
      if (c.method === "PATCH") return { body: [{ id: ID }] };
    });
    const res = await patchReq({ verificationStatus: "verified" });
    assert.equal(res.status, 200);
    const patch = calls.find((c) => c.method === "PATCH") as Call;
    assert.equal((patch.json as any).verification_status, "verified");
    assert.equal((patch.json as any).verified_by, "Priya (OC)");
    const log = calls.find((c) => c.path.includes("/audit_log")) as Call;
    assert.equal((log.json as any).action, "registration_updated");
    assert.equal((log.json as any).actor, "Priya (OC)");

    // Mail is not configured in tests, so both keys come back once for a manual hand-over;
    // only their hashes reach the database.
    const { data } = await body(res);
    assert.equal(data.portal.teamCode, "B-001");
    assert.equal(data.portal.delivery, "manual");
    assert.equal(data.portal.manualKeys.length, 2);
    const stored = calls.filter((c) => c.method === "PATCH" && (c.json as any).portal_token_hash);
    assert.equal(stored.length, 2);
    for (const k of data.portal.manualKeys) {
      assert.match(k.key, /^kmp_/);
      assert.ok(stored.some((c) => (c.json as any).portal_token_hash === sha256Hex(k.key)));
      assert.ok(!calls.some((c) => JSON.stringify(c.json ?? "").includes(k.key)));
    }
  });
});

describe("retention job", () => {
  const req = (token = "cron-secret") =>
    new Request("http://localhost/api/cron/retention", { headers: { authorization: `Bearer ${token}` } });

  it("requires the cron secret", async () => {
    installFakeSupabase(() => undefined);
    assert.equal((await retention(req("nope"))).status, 401);
  });

  it("does nothing until enabled and until the 180-day period has passed", async () => {
    installFakeSupabase(() => undefined);
    assert.equal((await body(await retention(req()))).data.purged, false);

    setEnv({ RETENTION_PURGE_ENABLED: "true", EVENT_START_ISO: "2099-01-01T10:00:00+05:30" });
    const res = await body(await retention(req()));
    assert.equal(res.data.purged, false);
    assert.match(res.data.reason, /Retention period runs until/);
  });

  it("deletes stored IDs, then anonymises, once the period has passed", async () => {
    setEnv({ RETENTION_PURGE_ENABLED: "true", EVENT_START_ISO: "2020-01-01T10:00:00+05:30" });
    const calls = installFakeSupabase((c) => {
      if (c.method === "GET" && c.path.includes("/rest/v1/team_members")) {
        return { body: [{ id_object_path: "reg_a/0-aa.pdf" }, { id_object_path: "reg_a/1-bb.jpg" }] };
      }
      if (c.method === "DELETE" && c.path.includes("/storage/v1/object/college-ids")) return { body: [] };
      if (c.path.endsWith("/rpc/anonymise_expired_personal_data")) return { body: { members: 2, teams: 1, messages: 3 } };
    });
    const res = await body(await retention(req()));
    assert.deepEqual(res.data, { purged: true, files: 2, members: 2, teams: 1, messages: 3 });
    const order = calls.map((c) => c.method + " " + c.url.pathname);
    assert.ok(
      order.findIndex((p) => p.startsWith("DELETE")) < order.findIndex((p) => p.includes("anonymise")),
      "files must be deleted before rows are anonymised",
    );
    const del = calls.find((c) => c.method === "DELETE") as Call;
    assert.deepEqual((del.json as any).prefixes, ["reg_a/0-aa.pdf", "reg_a/1-bb.jpg"]);
  });
});
