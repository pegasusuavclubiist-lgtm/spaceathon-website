# Kosmodrome 2026 — Backend Handoff

What the backend ships, how to run it, which rulebook rules it enforces, the
decisions that need an organiser's sign-off, and what is deliberately not built.
Read with `docs/api-contract.md` (the contract is unchanged except for the
additions listed in section 3).

## 1. What is in the box

| Path | Purpose |
| ---- | ------- |
| `app/api/register/route.ts` | `POST /api/register` |
| `app/api/register/[id]/college-id/route.ts` | `POST` college ID upload (multipart, token-authorised) |
| `app/api/contact/route.ts` | `POST /api/contact` |
| `app/api/admin/**` | OC API: list/read/verify/reject registrations, view an ID, triage messages |
| `app/api/cron/retention/route.ts` | 180-day personal-data purge (rulebook 15.6) |
| `app/api/health/route.ts` | liveness; `?deep=1` also pings the database |
| `lib/` | config, rules, validation, Supabase client, rate limiter, services |
| `supabase/migrations/0001_init.sql` | tables, RLS, RPCs, private `college-ids` bucket |
| `tests/` | 119 tests (`npm test`) |

Stack choice: **Supabase** (Postgres + Storage), because the env template already
reserved its variables. The client in `lib/supabase.ts` is plain `fetch` against
PostgREST/Storage, so there are no new runtime dependencies. The only new
dev dependency is `tsx` (test runner). Run `npm install` to refresh the lockfile.

## 2. Setup

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` (SQL editor
   or `supabase db push`). All tables have RLS on with no policies: only the
   service-role key, used server-side by these route handlers, can touch them.
2. Copy `.env.example` to `.env.local` and fill the Supabase values and secrets.
   For local testing set `REGISTRATION_OPEN=true`.
3. Frontend: set `NEXT_PUBLIC_API_MODE=live` (build-time flip).
4. Optional: schedule `GET /api/cron/retention` daily (Vercel Cron sends
   `Authorization: Bearer $CRON_SECRET`).

`NEXT_PUBLIC_SUPABASE_KEY` (anon) is not used by the backend; nothing in the
browser talks to Supabase directly.

## 3. Contract deltas (additive only)

**`POST /api/register` success (201, or 200 for an identical retry)** adds:

```json
{
  "data": {
    "id": "reg_…", "teamName": "…", "track": "Beginner", "memberCount": 3,
    "receivedAt": "…",
    "verificationStatus": "pending",
    "collegeIdUpload": {
      "url": "/api/register/reg_…/college-id", "method": "POST",
      "tokenType": "Bearer", "token": "…one-time capability…",
      "fileField": "file", "memberIndexField": "memberIndex",
      "maxBytes": 4194304,
      "allowedTypes": ["application/pdf", "image/jpeg", "image/png", "image/webp"],
      "expiresAt": "…team lock time, or null…"
    }
  }
}
```

**`POST /api/register/{id}/college-id`**: `multipart/form-data` with `memberIndex`
(0–3) and `file`; header `Authorization: Bearer <token>`. One request per member
(re-upload replaces). Returns `{ data: { memberIndex, uploaded: true, membersMissingId } }`.
Errors use the same envelope; file problems come back as
`fieldErrors["members.<i>.collegeId"]`.

**Status codes used:** 201/200, 400 (bad JSON), 401 (bad upload/admin token),
403 (registration closed, or teams locked), 409 (duplicate team name or member),
413, 415, 422 (field errors), 429 (+`Retry-After`), 503 (not configured), 500.

### Frontend follow-up (frontend-owned files, not changed here)

The frontend must upload the files after a successful registration, otherwise
teams register with no IDs and the OC cannot verify them. In `app/services/api.ts`:

```ts
export async function uploadCollegeId(
  grant: { url: string; token: string; fileField: string; memberIndexField: string },
  memberIndex: number,
  file: File,
): Promise<ApiResult<{ memberIndex: number; membersMissingId: number }>> {
  const form = new FormData();
  form.set(grant.memberIndexField, String(memberIndex));
  form.set(grant.fileField, file);
  // Do not set Content-Type: the browser adds the multipart boundary.
  const response = await fetch(grant.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${grant.token}` },
    body: form,
  });
  // …map the response onto ApiResult as `post()` does.
}
```

and add `verificationStatus` and `collegeIdUpload` to `RegisterResponse` in
`app/types/api.ts`. Phone photos often exceed 4 MB, so compress client-side
(or raise `MAX_ID_BYTES` and the bucket limit if the host allows larger bodies).

## 4. Rulebook enforcement

| Rule | Where |
| ---- | ----- |
| 3.3 Teams of 2–4, no solo | `validateRegistration`; also checked inside the `register_team` SQL function |
| 3.4 One person, one team | `UNIQUE (email_key)` on `team_members` → 409 on that member; attempt audited |
| 3.5 Institutional email + ID upload | free-mail domains rejected (`BLOCK_FREE_EMAIL_DOMAINS`); ID stored in a private bucket; magic-byte check; OC verification state with ID-on-file required before `verified` |
| 3.1 / 4.1 / 4.2 Tracks | Beginner only for Diploma, UG 1, UG 2; graduates → Advanced only; opting up allowed, never down (422 on `track`) |
| 3.6 Team lock D-3 | ID uploads refused after lock (403) |
| 3.7 Team leader | `leaderEmail` must be one of the members |
| 3.9 / Annex A Consent | all three flags must be literally `true`; stored with timestamp and `RULEBOOK_SHA256` |
| Section 2 Registration window | opens D-14, closes end of D-5; fails closed unless `REGISTRATION_OPEN=true` |
| 6.8 / Section 9 Platform security | rate limits (10 register, 20 contact, 60 upload per IP-hash per hour), size caps, hashed IPs, RLS deny-all, audit log (append-only trigger), ID views logged, admin brute-force limit |
| 15.6 Data protection | no raw IPs; 180-day purge after T+144 h; `legal_hold` exempts disputes; notifications carry ids only |
| 5.11 / confidentiality of reports | conduct/integrity messages: webhook gets the topic only, never the text |

## 5. Decisions that need an organiser's answer

These are the open questions at the end of the frontend handoff, with what the
code does today.

1. **Scope of the portal.** Built: registration, ID upload, contact, OC
   verification, retention. **Not built** (rulebook portal functions): per-member
   Annex A signing before T0, the D-1 pledge gate, problem-statement release and
   watermarking (Section 5), repositories, checkpoints, submission window and
   SHA-256 manifest (Section 8), the capped prediction leaderboard (12.2),
   scoring ledger and judge sheets (Section 10), appeals (Section 15). Registration
   consent is recorded for the team at sign-up; each member's own signature belongs
   to the portal phase.
2. **Where registrations and IDs live.** Supabase Postgres, and a private storage
   bucket `college-ids` (signed 60-second URLs for the OC only). Confirm Supabase
   region and that hosting personal data and IDs there is acceptable to IIST.
3. **Event dates.** Set `EVENT_START_ISO` to T0 once announced; the schedule
   derives from it. The rulebook gives days, not instants, so the defaults are:
   open 00:00 IST on D-14, close at end of D-5, lock 00:00 IST on D-3. Override
   with `REGISTRATION_OPENS_AT` / `REGISTRATION_CLOSES_AT` / `TEAM_LOCK_AT`.
   Frontend `siteConfig.eventStartISO` and `registrationOpen` must be flipped
   together with these env vars (they are separate switches).
4. **Domain owner.** Not a backend decision. The API is same-origin; once the
   domain is known set `NEXT_PUBLIC_SITE_URL` and use that origin for the host.
5. **Duplicate vs upsert.** Duplicate team names return 409, except an
   identical payload retried within 15 minutes, which returns the same team with
   a fresh upload token (covers lost responses and the UI's Retry button).

Rule choices to confirm: the seniority rule is a hard block (rulebook 4.1 says so;
the contract left it optional); personal-mail domains are blocked; the leader must
be a member; the rulebook is marked "Draft for Organising Committee review".
Also: the rulebook is titled **Kakshya 2026**, the site brand is **Kosmodrome**.

## 6. Admin API

`Authorization: Bearer $ADMIN_API_TOKEN` and `X-Admin-Actor: <name>` on every call.

| Call | Purpose |
| ---- | ------- |
| `GET /api/admin/registrations?status=&track=&limit=&offset=` | queue with members |
| `GET /api/admin/registrations/{id}` | one team |
| `PATCH /api/admin/registrations/{id}` | `{verificationStatus, reason?, legalHold?}` |
| `GET /api/admin/registrations/{id}/members/{0-3}/college-id` | 60 s signed URL (audited) |
| `GET /api/admin/messages?status=&topic=` / `PATCH /api/admin/messages/{id}` | triage |

A shared token is a stop-gap. Rulebook Section 9 requires role-based access and
MFA for organisers; use a real identity provider before the portal phase.

## 7. Verification status

Verified here: strict TypeScript typecheck of `lib/`, `app/api/`, `tests/` and
`app/content/`; 62 passing tests (`npm test`), including route-level tests of
every endpoint against a fake Supabase, and a parity test that fails if
`programmeOptions` / `contactTopics` change on the frontend.

**Not verified** (no network or `node_modules` in the build sandbox):
`npm run lint`, `npm run build` against Next 16.4.6 (route handlers use the
standard `Request`/`Response` API and `params` as a Promise, and no route segment
config because `cacheComponents` is on; check `node_modules/next/dist/docs/` as
`AGENTS.md` advises), and the SQL migration and Storage calls against a live
Supabase project. Do a smoke test with a real project before opening registration.


---

# Phase 2: the portal (added after the first handoff)

The sections above describe registration. Phase 2 builds the rest of the rulebook's
portal on the same stack: see `docs/PORTAL_API.md` for every endpoint.

**New:** `supabase/migrations/0002_portal.sql` (apply after 0001), `lib/` modules for the schedule
(`schedule.ts`), scoring (`scoring.ts`), manifests (`manifest.ts`), Stage 0 (`stage0.ts`), watermarks and
canaries (`watermark.ts`), the ledger, mail, judge and member auth, results; routes under
`app/api/portal`, `app/api/judge`, `app/api/admin` and `app/api/results`; frontend at `/portal`.

**Rule coverage added:** Annex A pledge/final declaration; Team IDs (B-001/A-001) and blind judging;
problem release at T0 with download logs, per-team seeds, visible and hidden watermarks and CSV canary
records (5.7-5.9); Checkpoints 1-3 (6.4); submission window with signed uploads, magic-byte checks,
SHA-256 manifests and the technical grace (8); capped prediction leaderboard (12.2); Stage 0 screening
(10.3); two judges, third on disagreement, locked sheets and moderator corrections (10.4-10.8); Stage 1/2
weighting, finalists, tie-breakers and penalties (10-13); append-only hash-chained ledger (9); winner
audit gate on final results (9.4, 14.1); appeals (15); role-based OC tokens.

**Still not built, and why:**

* Repositories. The portal does not create or watch Git repositories. The Technical Committee's tooling
  imports snapshots and commit stats through `submissions/snapshots` and `stage0`.
* Code and report similarity scanning (9.1) runs outside this service; only its result is entered.
* The Advanced benchmark scorer. The service calls `EVAL_SERVICE_URL` (contract in `lib/eval.ts`) so labels
  never leave organiser systems; that service does not exist yet. Without it, uploads stay `pending`.
* Watermarks on binary files. PDF/image statements are served logged but unmodified; only text and CSV
  are marked. Add a PDF library (e.g. `pdf-lib`) to stamp PDFs.
* Multi-factor organiser login (9). Role-based static tokens only; put an identity provider in front.
* Mentor session booking (6.3), the D-1 briefing/dry-run tooling, the clarification channel, and the
  watermarked per-team variant generation itself (the seed is provided; generating variants is
  problem-setter work).
* Storage size: Supabase's free plan caps objects at 50 MB, so a 6-minute demo may not fit. Raise the
  project limit and the bucket limits in 0002 if needed.

**Verification:** typecheck of `lib/`, `app/api/` and `tests/` is clean; 119 tests pass, including
route-level tests of the portal, judging and role checks against a fake Supabase, and unit tests for
scoring, schedule, manifest, Stage 0 and watermarks. **Not verified:** migration 0002 and the Storage
signed-upload calls against a real Supabase project (the signed-upload response shape in
`lib/supabase.ts` is written from the documented API); `next build` and `npm run lint` (no
`node_modules`/network in the build environment); the React portal UI in a browser; Resend delivery.
