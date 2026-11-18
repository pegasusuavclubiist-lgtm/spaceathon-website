-- Kosmodrome 2026 backend, phase 2: the participant/judge/OC portal.
-- Covers rulebook Sections 5 (problem release), 6.4 (checkpoints), 8 (submissions),
-- 9 (ledger), 10 (judging), 12 (benchmark leaderboard), 13 (penalties), 15 (appeals).
-- Same security model as 0001: RLS on, no policies, service role only.

-- ── Teams and members: portal identity ──────────────────────────────────────
alter table public.teams
  add column team_code           text unique,           -- B-001 / A-001, used for blind judging
  add column portal_activated_at timestamptz,
  add column disqualified        boolean not null default false,
  add column disqualified_reason text,
  add column grace_granted       boolean not null default false, -- ticket raised before T+48 (8.3)
  add column repo_url            text;

alter table public.team_members
  add column portal_token_hash            text unique,  -- hash of the member's portal key
  add column pledge_signed_at             timestamptz,  -- Annex A, before T0
  add column pledge_rulebook_sha256       text,
  add column final_declaration_signed_at  timestamptz;  -- Annex A, with the final submission

create sequence public.team_code_beginner;
create sequence public.team_code_advanced;

-- Idempotent: a team keeps its code once assigned.
create function public.assign_team_code(p_team_id text) returns text
language plpgsql security definer set search_path = public as $$
declare v_track text; v_code text;
begin
  select track, team_code into v_track, v_code from public.teams where id = p_team_id for update;
  if not found then raise exception 'unknown team' using errcode = 'P0002'; end if;
  if v_code is not null then return v_code; end if;
  if v_track = 'Beginner' then
    v_code := 'B-' || lpad(nextval('public.team_code_beginner')::text, 3, '0');
  else
    v_code := 'A-' || lpad(nextval('public.team_code_advanced')::text, 3, '0');
  end if;
  update public.teams set team_code = v_code where id = p_team_id;
  return v_code;
end $$;

-- ── Append-only ledger with a hash chain (rulebook Section 9) ───────────────
create table public.ledger (
  id        bigint generated always as identity primary key,
  at        timestamptz not null,
  kind      text not null,
  subject   text,
  payload   jsonb not null default '{}'::jsonb,
  prev_hash text not null,
  hash      text not null
);

create function public.ledger_guard() returns trigger language plpgsql as $$
begin raise exception 'ledger is append-only'; end $$;
create trigger ledger_no_change before update or delete on public.ledger
  for each row execute function public.ledger_guard();

create function public.ledger_hash(p_prev text, p_kind text, p_subject text, p_payload jsonb, p_at timestamptz)
returns text language sql immutable as $$
  select encode(sha256(convert_to(
    p_prev || '|' || p_kind || '|' || coalesce(p_subject, '') || '|' || p_payload::text || '|' ||
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), 'utf8')), 'hex')
$$;

create function public.ledger_append(p_kind text, p_subject text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_prev text; v_at timestamptz := clock_timestamp(); v_hash text; v_id bigint;
begin
  perform pg_advisory_xact_lock(7770001);
  select hash into v_prev from public.ledger order by id desc limit 1;
  v_prev := coalesce(v_prev, '');
  v_hash := public.ledger_hash(v_prev, p_kind, p_subject, p_payload, v_at);
  insert into public.ledger (at, kind, subject, payload, prev_hash, hash)
  values (v_at, p_kind, p_subject, p_payload, v_prev, v_hash) returning id into v_id;
  return jsonb_build_object('id', v_id, 'hash', v_hash);
end $$;

-- Returns the id of the first entry whose hash or link is wrong, or null if the chain is intact.
create function public.verify_ledger() returns bigint
language plpgsql security definer set search_path = public as $$
declare r record; v_prev text := '';
begin
  for r in select * from public.ledger order by id loop
    if r.prev_hash <> v_prev or r.hash <> public.ledger_hash(r.prev_hash, r.kind, r.subject, r.payload, r.at) then
      return r.id;
    end if;
    v_prev := r.hash;
  end loop;
  return null;
end $$;

-- ── Problem statements and datasets (Section 5) ─────────────────────────────
create table public.problem_files (
  id            text primary key,
  track         text not null check (track in ('Beginner', 'Advanced')),
  kind          text not null check (kind in ('statement', 'dataset', 'starter', 'other')),
  name          text not null,
  content_type  text not null,
  object_path   text not null,
  size_bytes    bigint not null,
  sha256        text not null,
  active        boolean not null default true,   -- false = retired (reserve plan, 5.6)
  uploaded_by   text not null,
  created_at    timestamptz not null default now()
);

create table public.download_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  team_id     text not null references public.teams (id) on delete cascade,
  member_pos  smallint,
  file_id     text not null,
  ip_hash     text,
  watermarked boolean not null default false
);
create index download_log_team_idx on public.download_log (team_id, at);

-- ── Checkpoints (6.4): 1 and 3 are notes, 2 is a live check-in recorded by the OC ─
create table public.checkpoints (
  team_id      text not null references public.teams (id) on delete cascade,
  n            smallint not null check (n in (1, 2, 3)),
  note         text,
  word_count   integer,
  repo_sha     text,
  present_positions smallint[],          -- checkpoint 2: members who attended
  recorded_by  text,                     -- member position (notes) or OC actor
  recorded_at  timestamptz not null default now(),
  primary key (team_id, n)
);

create table public.support_tickets (
  id          text primary key,
  team_id     text not null references public.teams (id) on delete cascade,
  member_pos  smallint,
  kind        text not null default 'general' check (kind in ('general', 'upload_failure')),
  subject     text not null,
  body        text not null,
  status      text not null default 'open' check (status in ('open', 'resolved')),
  created_at  timestamptz not null default now()
);

-- ── Submissions (Section 8) ─────────────────────────────────────────────────
create table public.submission_items (
  id           bigint generated always as identity primary key,
  team_id      text not null references public.teams (id) on delete cascade,
  item         text not null check (item in ('report', 'demo', 'predictions', 'deck')),
  object_path  text not null,
  content_type text not null,
  size_bytes   bigint not null,
  sha256       text not null,
  in_grace     boolean not null default false,
  uploaded_pos smallint,
  uploaded_at  timestamptz not null default now()
);
create index submission_items_team_idx on public.submission_items (team_id, item, uploaded_at desc);

create table public.repo_snapshots (
  team_id     text primary key references public.teams (id) on delete cascade,
  repo_url    text not null,
  commit_sha  text not null,
  facts       jsonb not null default '{}'::jsonb,  -- commit stats, README/env/Dockerfile presence, similarity
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

create table public.submission_manifests (
  team_id         text primary key references public.teams (id) on delete cascade,
  manifest_sha256 text not null,
  payload         jsonb not null,
  created_at      timestamptz not null default now()
);

create table public.stage0_results (
  team_id  text primary key references public.teams (id) on delete cascade,
  passed   boolean not null,
  issues   jsonb not null default '[]'::jsonb,   -- hard failures
  reviews  jsonb not null default '[]'::jsonb,   -- manual-review flags
  run_by   text not null,
  run_at   timestamptz not null default now()
);

-- Advanced track prediction uploads and the capped leaderboard (12.1, 12.2).
create table public.prediction_uploads (
  id            text primary key,
  team_id       text not null references public.teams (id) on delete cascade,
  object_path   text not null,
  sha256        text not null,
  size_bytes    bigint not null,
  eval_status   text not null default 'pending' check (eval_status in ('pending', 'scored', 'failed')),
  public_score  double precision,
  private_score double precision,        -- never returned to teams
  selected      boolean not null default false,
  uploaded_at   timestamptz not null default now()
);
create index prediction_uploads_team_idx on public.prediction_uploads (team_id, uploaded_at desc);

-- ── Judging (Section 10) ────────────────────────────────────────────────────
create table public.judges (
  id          text primary key,
  name        text not null,
  role        text not null check (role in ('judge', 'chair', 'moderator', 'grand_jury')),
  tracks      text[] not null default '{}',
  token_hash  text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.judge_conflicts (
  judge_id text not null references public.judges (id) on delete cascade,
  team_id  text not null references public.teams (id) on delete cascade,
  reason   text,
  primary key (judge_id, team_id)
);

create table public.judge_assignments (
  judge_id text not null references public.judges (id) on delete cascade,
  team_id  text not null references public.teams (id) on delete cascade,
  stage    smallint not null check (stage in (1, 2)),
  third    boolean not null default false,   -- added by moderation (10.6)
  primary key (judge_id, team_id, stage)
);

create table public.score_sheets (
  id             bigint generated always as identity primary key,
  judge_id       text not null references public.judges (id),
  team_id        text not null references public.teams (id) on delete cascade,
  stage          smallint not null check (stage in (1, 2)),
  scores         jsonb not null,           -- { criterionKey: number }
  justifications jsonb not null,           -- { criterionKey: "one line" }
  comment        text,
  total          numeric not null,
  submitted_at   timestamptz not null default now(),
  constraint score_sheets_one_per_judge unique (judge_id, team_id, stage)
);

create function public.score_sheets_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('kosmodrome.allow_correction', true) = 'on' then
    return new;
  end if;
  raise exception 'score sheets are locked after submission (10.8)';
end $$;
create trigger score_sheets_locked before update or delete on public.score_sheets
  for each row execute function public.score_sheets_guard();

create table public.score_corrections (
  id         bigint generated always as identity primary key,
  sheet_id   bigint not null references public.score_sheets (id),
  old_scores jsonb not null,
  new_scores jsonb not null,
  old_total  numeric not null,
  new_total  numeric not null,
  reason     text not null,
  moderator  text not null,
  at         timestamptz not null default now()
);

-- Moderator correction: written reason, ledger entry, original kept (10.8).
create function public.correct_score_sheet(
  p_sheet_id bigint, p_scores jsonb, p_total numeric, p_reason text, p_moderator text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_old record;
begin
  select * into v_old from public.score_sheets where id = p_sheet_id for update;
  if not found then raise exception 'unknown score sheet' using errcode = 'P0002'; end if;
  insert into public.score_corrections (sheet_id, old_scores, new_scores, old_total, new_total, reason, moderator)
  values (p_sheet_id, v_old.scores, p_scores, v_old.total, p_total, p_reason, p_moderator);
  perform set_config('kosmodrome.allow_correction', 'on', true);
  update public.score_sheets set scores = p_scores, total = p_total where id = p_sheet_id;
  return public.ledger_append('score_corrected', p_sheet_id::text,
    jsonb_build_object('oldTotal', v_old.total, 'newTotal', p_total, 'moderator', p_moderator));
end $$;

-- Script-scored parts: Beginner requirements checklist, Advanced benchmark (10.4).
create table public.script_scores (
  team_id    text primary key references public.teams (id) on delete cascade,
  requirements_working integer,
  requirements_total   integer,
  benchmark_private    double precision,
  benchmark_baseline   double precision,
  benchmark_reference  double precision,
  clean_run_ok         boolean,
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

create table public.penalties (
  id         bigint generated always as identity primary key,
  team_id    text not null references public.teams (id) on delete cascade,
  code       text not null check (code in (
               'identity_leak', 'undeclared_third_party', 'undeclared_ai', 'conduct_repeat')),
  points     numeric not null check (points > 0),
  reason     text not null,
  applied_by text not null,
  at         timestamptz not null default now()
);

create table public.results (
  team_id     text primary key references public.teams (id) on delete cascade,
  track       text not null,
  stage1      numeric,
  stage2      numeric,
  final       numeric,
  rank        integer,
  finalist    boolean not null default false,
  detail      jsonb not null default '{}'::jsonb,
  phase       text not null default 'draft' check (phase in ('draft', 'provisional', 'final')),
  audit_passed boolean,
  computed_at timestamptz not null default now()
);

-- ── Appeals (Section 15) ────────────────────────────────────────────────────
create table public.appeals (
  id            text primary key,
  team_id       text not null unique references public.teams (id) on delete cascade, -- one per team
  ground        text not null check (ground in (
                  'arithmetic_error', 'misapplied_rule', 'undeclared_conflict', 'procedural_irregularity')),
  description   text not null,
  status        text not null default 'open' check (status in ('open', 'upheld', 'rejected')),
  decision_note text,
  decided_by    text,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ── Private storage buckets ─────────────────────────────────────────────────
-- Supabase's free plan caps objects at 50 MB globally; raise the project limit
-- if you need demo videos up to the 6-minute rulebook limit in full quality.
insert into storage.buckets (id, name, public, file_size_limit)
values ('problems', 'problems', false, 52428800),
       ('submissions', 'submissions', false, 52428800)
on conflict (id) do nothing;

-- ── Retention: extend the 180-day purge (15.6) ──────────────────────────────
create or replace function public.anonymise_expired_personal_data()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_members int; v_teams int; v_msgs int;
begin
  update public.team_members m
     set full_name = '[removed]', email = '[removed]',
         email_key = 'purged:' || m.id::text, college = '[removed]',
         id_object_path = null, id_content_type = null,
         id_size_bytes = null, id_uploaded_at = null, portal_token_hash = null
    from public.teams t
   where t.id = m.team_id and not t.legal_hold and t.purged_at is null;
  get diagnostics v_members = row_count;

  update public.support_tickets s set subject = '[removed]', body = '[removed]'
    from public.teams t where t.id = s.team_id and not t.legal_hold and t.purged_at is null;
  update public.appeals a set description = '[removed]'
    from public.teams t where t.id = a.team_id and not t.legal_hold and t.purged_at is null;
  update public.checkpoints c set note = null
    from public.teams t where t.id = c.team_id and not t.legal_hold and t.purged_at is null;
  delete from public.download_log d using public.teams t
   where t.id = d.team_id and not t.legal_hold and t.purged_at is null;

  update public.teams
     set leader_email = '[removed]', purged_at = now()
   where not legal_hold and purged_at is null;
  get diagnostics v_teams = row_count;

  update public.contact_messages
     set name = '[removed]', email = '[removed]', message = '[removed]',
         ip_hash = null, purged_at = now()
   where not legal_hold and purged_at is null;
  get diagnostics v_msgs = row_count;

  return jsonb_build_object('members', v_members, 'teams', v_teams, 'messages', v_msgs);
end $$;

-- ── RLS: deny everything to anon / authenticated on every new table ─────────
do $$
declare t text;
begin
  foreach t in array array[
    'ledger','problem_files','download_log','checkpoints','support_tickets',
    'submission_items','repo_snapshots','submission_manifests','stage0_results',
    'prediction_uploads','judges','judge_conflicts','judge_assignments','score_sheets',
    'score_corrections','script_scores','penalties','results','appeals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on function public.assign_team_code(text) from public, anon, authenticated;
revoke all on function public.ledger_append(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.verify_ledger() from public, anon, authenticated;
revoke all on function public.correct_score_sheet(bigint, jsonb, numeric, text, text) from public, anon, authenticated;
grant execute on function public.assign_team_code(text) to service_role;
grant execute on function public.ledger_append(text, text, jsonb) to service_role;
grant execute on function public.verify_ledger() to service_role;
grant execute on function public.correct_score_sheet(bigint, jsonb, numeric, text, text) to service_role;
