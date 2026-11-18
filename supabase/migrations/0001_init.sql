-- Kosmodrome 2026 backend schema.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- All tables have row level security ON and no policies: only the service role
-- (used by the Next.js route handlers on the server) can read or write them.

-- ── Teams and members ───────────────────────────────────────────────────────
create table public.teams (
  id                 text primary key,
  team_name          text not null,
  team_name_key      text generated always as (lower(team_name)) stored,
  track              text not null check (track in ('Beginner', 'Advanced')),
  leader_email       text not null,
  -- OC verification of emails and college IDs (rulebook 3.5, due by D-3).
  verification_status text not null default 'pending'
                       check (verification_status in ('pending', 'verified', 'rejected')),
  rejection_reason   text,
  verified_at        timestamptz,
  verified_by        text,
  -- Idempotent replay of an identical retry, and the hashed upload capability.
  payload_hash       text not null,
  upload_token_hash  text not null,
  -- Consent record (rulebook 3.9 / Annex A) with the rulebook version agreed to.
  rulebook_sha256    text,
  consented_at       timestamptz not null default now(),
  -- Retention (rulebook 15.6): legal_hold keeps data needed for a dispute.
  legal_hold         boolean not null default false,
  purged_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint teams_name_unique unique (team_name_key)
);

create table public.team_members (
  id               bigint generated always as identity primary key,
  team_id          text not null references public.teams (id) on delete cascade,
  position         smallint not null check (position between 0 and 3),
  full_name        text not null,
  email            text not null,
  -- Lower-cased email. UNIQUE across all teams = "one person, one team" (3.4).
  email_key        text not null,
  college          text not null,
  programme        text not null check (programme in (
                     'Diploma', 'UG year 1', 'UG year 2', 'UG year 3',
                     'UG year 4+', 'PG', 'PhD', 'Graduate within six months')),
  id_object_path   text,
  id_content_type  text,
  id_size_bytes    integer,
  id_uploaded_at   timestamptz,
  constraint team_members_position_unique unique (team_id, position),
  constraint team_members_email_unique unique (email_key)
);

create index team_members_team_idx on public.team_members (team_id);
create index teams_status_idx on public.teams (verification_status, track, created_at desc);

-- ── Contact messages ────────────────────────────────────────────────────────
create table public.contact_messages (
  id          text primary key,
  name        text not null,
  email       text not null,
  topic       text not null check (topic in (
                'Registration', 'Eligibility and tracks', 'Accessibility request',
                'Conduct or integrity report', 'Technical support', 'General question')),
  message     text not null,
  status      text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  ip_hash     text,
  legal_hold  boolean not null default false,
  purged_at   timestamptz,
  created_at  timestamptz not null default now()
);

create index contact_messages_status_idx on public.contact_messages (status, created_at desc);

-- ── Rate limiting (fixed window, shared across serverless instances) ────────
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- ── Audit log (append-only, rulebook Section 9 "audit logs") ────────────────
create table public.audit_log (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  actor    text not null,
  action   text not null,
  subject  text,
  detail   jsonb not null default '{}'::jsonb
);

create function public.audit_log_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_append_only();

create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger teams_touch_updated_at
  before update on public.teams
  for each row execute function public.touch_updated_at();

-- ── Row level security: deny everything to anon / authenticated ─────────────
alter table public.teams            enable row level security;
alter table public.team_members     enable row level security;
alter table public.contact_messages enable row level security;
alter table public.rate_limits      enable row level security;
alter table public.audit_log        enable row level security;

revoke all on all tables in schema public from anon, authenticated;

-- ── Functions (service role only) ───────────────────────────────────────────

-- Atomic registration: team + members in one transaction. Unique violations
-- (team name, member email) surface to the API as SQLSTATE 23505.
create function public.register_team(p_team jsonb, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count   int := jsonb_array_length(p_members);
  v_created timestamptz;
begin
  if v_count < 2 or v_count > 4 then
    raise exception 'team size must be 2 to 4' using errcode = 'P0001';
  end if;

  insert into public.teams (
    id, team_name, track, leader_email, payload_hash, upload_token_hash, rulebook_sha256
  ) values (
    p_team->>'id', p_team->>'team_name', p_team->>'track', p_team->>'leader_email',
    p_team->>'payload_hash', p_team->>'upload_token_hash',
    nullif(p_team->>'rulebook_sha256', '')
  ) returning created_at into v_created;

  insert into public.team_members (
    team_id, position, full_name, email, email_key, college, programme
  )
  select p_team->>'id', (m->>'position')::smallint, m->>'full_name',
         lower(m->>'email'), lower(m->>'email'), m->>'college', m->>'programme'
  from jsonb_array_elements(p_members) as m;

  return jsonb_build_object('id', p_team->>'id', 'created_at', v_created);
end $$;

-- Counts a hit and reports whether the caller is still within the limit.
create function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', v_hits <= p_limit,
    'retry_after', greatest(1, ceil(extract(epoch from
      (v_window + make_interval(secs => p_window_seconds) - now())))::int)
  );
end $$;

-- Retention (rulebook 15.6): remove personal data once the retention period has
-- passed, except rows under legal hold. Storage objects are deleted by the API
-- before this runs.
create function public.anonymise_expired_personal_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_members int;
  v_teams   int;
  v_msgs    int;
begin
  update public.team_members m
     set full_name = '[removed]', email = '[removed]',
         email_key = 'purged:' || m.id::text, college = '[removed]',
         id_object_path = null, id_content_type = null,
         id_size_bytes = null, id_uploaded_at = null
    from public.teams t
   where t.id = m.team_id and not t.legal_hold and t.purged_at is null;
  get diagnostics v_members = row_count;

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

revoke all on function public.register_team(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke all on function public.anonymise_expired_personal_data() from public, anon, authenticated;
grant execute on function public.register_team(jsonb, jsonb) to service_role;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
grant execute on function public.anonymise_expired_personal_data() to service_role;

-- ── Private storage bucket for college IDs ──────────────────────────────────
-- If you raise MAX_ID_BYTES in the environment, raise file_size_limit too.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'college-ids', 'college-ids', false, 4194304,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;
