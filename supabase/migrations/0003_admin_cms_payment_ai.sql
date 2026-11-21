-- Kosmodrome 2027 backend, phase 3:
--   1. UPI QR Payment tracking (IISTian ₹299 / Outsider ₹499) + payment-gated confirmation email
--   2. Full Website CMS (`site_content`) editable from /admin
--   3. Judging AI-Usage Analysis (`ai_usage_reports`) visible in /judge and /admin
-- Same security model as 0001/0002: RLS on, no policies, service role only.

-- ── Teams: payment verification & confirmation email gating ─────────────────
alter table public.teams
  add column if not exists participant_category       text not null default 'outsider'
    check (participant_category in ('iist', 'outsider')),
  add column if not exists fee_amount                 integer not null default 499
    check (fee_amount >= 0),
  add column if not exists payment_status             text not null default 'pending'
    check (payment_status in ('pending', 'confirmed', 'rejected')),
  add column if not exists payment_utr                text,
  add column if not exists payment_proof_path         text,
  add column if not exists payment_proof_content_type text,
  add column if not exists payment_proof_size_bytes   integer,
  add column if not exists payment_proof_uploaded_at  timestamptz,
  add column if not exists payment_confirmed_at       timestamptz,
  add column if not exists payment_confirmed_by       text,
  add column if not exists payment_rejection_reason   text,
  add column if not exists confirmation_email_sent_at timestamptz;

create index if not exists teams_payment_status_idx
  on public.teams (payment_status, verification_status, created_at desc);

-- Update atomic registration RPC to store payment details safely.
create or replace function public.register_team(p_team jsonb, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count    int := jsonb_array_length(p_members);
  v_created  timestamptz;
  v_category text := coalesce(nullif(p_team->>'participant_category', ''), 'outsider');
  v_fee      int  := coalesce(nullif(p_team->>'fee_amount', '')::int, case when v_category = 'iist' then 299 else 499 end);
begin
  if v_count < 2 or v_count > 4 then
    raise exception 'team size must be 2 to 4' using errcode = 'P0001';
  end if;

  insert into public.teams (
    id, team_name, track, leader_email, payload_hash, upload_token_hash, rulebook_sha256,
    participant_category, fee_amount, payment_utr, payment_status
  ) values (
    p_team->>'id', p_team->>'team_name', p_team->>'track', p_team->>'leader_email',
    p_team->>'payload_hash', p_team->>'upload_token_hash',
    nullif(p_team->>'rulebook_sha256', ''),
    v_category, v_fee, nullif(p_team->>'payment_utr', ''), 'pending'
  ) returning created_at into v_created;

  insert into public.team_members (
    team_id, position, full_name, email, email_key, college, programme
  )
  select p_team->>'id', (m->>'position')::smallint, m->>'full_name',
         lower(m->>'email'), lower(m->>'email'), m->>'college', m->>'programme'
  from jsonb_array_elements(p_members) as m;

  return jsonb_build_object('id', p_team->>'id', 'created_at', v_created);
end $$;

-- Private storage bucket for UPI payment screenshots
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs', 'payment-proofs', false, 4194304,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ── Website CMS content overrides (editable from /admin) ────────────────────
create table if not exists public.site_content (
  section    text primary key,
  data       jsonb not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

-- ── AI usage analysis reports for judging portal (/judge & /admin) ──────────
create table if not exists public.ai_usage_reports (
  team_id                 text primary key references public.teams (id) on delete cascade,
  overall_ai_percent      numeric(5,2) not null check (overall_ai_percent between 0 and 100),
  code_ai_percent         numeric(5,2) check (code_ai_percent between 0 and 100),
  report_ai_percent       numeric(5,2) check (report_ai_percent between 0 and 100),
  declared_ai_tools       text[] not null default '{}',
  declared_ai_log_present boolean not null default false,
  undeclared_ai_suspected boolean not null default false,
  risk_level              text not null default 'low' check (risk_level in ('low', 'moderate', 'high')),
  file_breakdown          jsonb not null default '[]'::jsonb,
  signals                 jsonb not null default '[]'::jsonb,
  summary                 text,
  analyzed_by             text not null,
  analyzed_at             timestamptz not null default now()
);

-- ── RLS: deny everything to anon / authenticated on new tables ──────────────
alter table public.site_content     enable row level security;
alter table public.ai_usage_reports enable row level security;

revoke all on table public.site_content     from anon, authenticated;
revoke all on table public.ai_usage_reports from anon, authenticated;
