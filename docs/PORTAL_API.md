# Kosmodrome 2026: portal, judging and OC API (phase 2)

Authentication: participants use a personal key (`Authorization: Bearer kmp_…`, issued when
the OC verifies the team), judges use `kmj_…`, the OC uses `ADMIN_TOKENS` / `ADMIN_API_TOKEN`.
Only hashes are stored. Responses use the same `{ data }` / `{ error: { message, fieldErrors } }`
envelope as the registration API. All times are derived from `EVENT_START_ISO` (T0); every
gate fails closed while it is empty.

## Participants (`/api/portal/*`)

| Call | Rulebook | Notes |
| ---- | -------- | ----- |
| `GET me` | 2 | team, Team ID, schedule, what is open |
| `POST declaration {kind: pledge\|final, accepted}` | Annex A | pledge before T0; final during the submission window |
| `GET problems` / `GET problems/{id}` | 5.7, 5.8, 5.9 | T0 onwards, pledge required; logged; text watermarked, CSV canaries, others via 60 s signed URL; per-team `seed` |
| `GET checkpoints`, `POST checkpoints/{1\|3} {note, commitSha?}` | 6.4 | 200 words, T0 to checkpoint instant, editable until then |
| `POST tickets {kind, subject, body}` | 6.9, 8.3 | `upload_failure` inside T+40..T+48 grants the 10-minute grace |
| `GET submission` | 8, Annex D | items, missing list, manifest preview or frozen manifest |
| `POST submission/upload-url {item}` then PUT then `POST submission/items {item, objectPath}` | 8.1 | report, demo, deck; size and magic-byte checks; SHA-256 recorded; last valid upload counts |
| `GET predictions`, `POST predictions/upload-url`, `POST predictions`, `POST predictions/select`, `GET leaderboard` | 12.1, 12.2 | Advanced only; 5 per rolling 12 h; public score only |
| `GET appeals`, `POST appeals {ground, description}` | 15 | leader only, T+102..T+126, one per team |
| `GET feedback` | 10.9 | after final results: criterion means, anonymised comments |

## Judges (`/api/judge/*`)

`GET assignments`, `GET submissions/{teamCode}` (blind: Team ID only, signed links, frozen
manifest), `POST scores {teamCode, stage, scores, justifications, comment?}` (locked on submit,
one per judge/team/stage, ledger entry), `GET finalists` (Grand Jury, no Stage 1 scores).

## OC (`/api/admin/*`)

Existing: registrations, messages. New (role in brackets; `oc` is always allowed):

| Call | Role | Purpose |
| ---- | ---- | ------- |
| `PATCH registrations/{id}` verified | any | now also assigns the Team ID, issues keys, emails them |
| `POST registrations/{id}/members/{i}/reissue-key` | oc | replace a lost or shared key |
| `POST problems/upload-url`, `POST problems`, `GET problems`, `DELETE problems/{id}` | technical | register the live set (hashes recorded and chained), retire a file |
| `POST checkpoints {teamId, presentPositions}` | technical | record Checkpoint 2 |
| `POST submissions/snapshots` | technical | import repository snapshots (commit SHA, README/env/Dockerfile facts) |
| `POST submissions/close` | technical | after T+48 (+grace): freeze manifests into the ledger |
| `POST stage0` | technical | Stage 0 screening from commit stats and similarity |
| `POST scripts` | technical | requirements checklist and benchmark inputs |
| `POST judges`, `PUT judges`, `GET judges` | oc / judging | create judges (key shown once), declare conflicts |
| `POST assignments {track, mode}` | judging | `stage1`, `third` (moderation), `stage2` |
| `POST results/compute {track, save?}` | judging | script-computed Stage 1, finalists, Stage 2, ranking, flags |
| `POST results/audit`, `POST results/publish` | oc | winner audit; provisional/final (final needs top-3 audits) |
| `POST score-corrections` | moderator | correct a locked sheet with a reason; original kept |
| `POST penalties`, `POST teams/{id}/disqualify` | oc | manual penalties (ranges enforced), disqualification |
| `GET appeals`, `PATCH appeals/{id}` | oc | Grievance Committee |
| `GET ledger` | oc | hash-chain verification |
| `POST leak-trace` | technical | match a leaked CSV to a team's canary records |

Public: `GET /api/results?track=` (published results only).

## Interpretations the OC should confirm

* Checkpoint notes are accepted from T0 until the checkpoint instant; there is no earlier window.
* "No commits across two checkpoints" is implemented as no commit between two consecutive checkpoints (a review flag, not a failure).
* Moderation compares judge-scored points only (script points are identical for both judges).
* `S1 = mean(two closest judge totals) + script points - penalties`, floored at 0.
* A team is ranked only if it passed Stage 0, has at least two Stage 1 sheets and is not disqualified.
* The finalists are the top 8 by Stage 1; Stage 2 sheets then decide `0.6 S1 + 0.4 S2`.
* The pledge cannot be signed after T0 (OC must intervene); "no pledge, no access" is per member.
