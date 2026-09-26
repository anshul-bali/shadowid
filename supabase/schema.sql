-- ShadowID schema: tables, indexes, RLS
-- Applied via scripts/apply-schema.mjs (pg over the session pooler)

create extension if not exists pgcrypto;

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_name text not null,
  handles jsonb not null default '[]'::jsonb,
  profile_links jsonb not null default '[]'::jsonb,
  context text,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  stage text not null default 'queued' check (stage in ('queued','collecting','researching','matching','reporting','scoring','done','failed')),
  stage_detail text,
  error text,
  shadow_score integer check (shadow_score is null or (shadow_score >= 0 and shadow_score <= 100)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_scans_user on public.scans(user_id, created_at desc);

create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete cascade,
  consent_type text not null default 'identity_scan',
  statement text not null,
  granted boolean not null default false,
  granted_at timestamptz not null default now()
);
create index if not exists idx_consents_user on public.consents(user_id);
create index if not exists idx_consents_scan on public.consents(scan_id);

create table if not exists public.source_evidence (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  title text not null,
  excerpt text,
  source_type text not null default 'web',
  query text,
  relevance real,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_evidence_scan on public.source_evidence(scan_id);
create index if not exists idx_evidence_user on public.source_evidence(user_id);

create table if not exists public.agent_findings (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agent text not null check (agent in ('research','match','report')),
  finding_type text not null,
  title text not null,
  description text,
  severity text not null default 'low' check (severity in ('low','medium','high','critical')),
  confidence real not null default 0.5 check (confidence >= 0 and confidence <= 1),
  needs_review boolean not null default false,
  evidence_ids uuid[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_findings_scan on public.agent_findings(scan_id);
create index if not exists idx_findings_user on public.agent_findings(user_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_id uuid references public.scans(id) on delete set null,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null,
  status text not null default 'pending' check (status in ('pending','analyzed','failed')),
  analysis jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_documents_user on public.documents(user_id);
create index if not exists idx_documents_scan on public.documents(scan_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shadow_score integer not null check (shadow_score >= 0 and shadow_score <= 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  summary text not null,
  narrative text,
  narrative_error text,
  recommended_actions jsonb not null default '[]'::jsonb,
  uncertainty_notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_reports_user on public.reports(user_id, created_at desc);

-- ============================================================================
-- Row Level Security: every user sees only their own records
-- ============================================================================

alter table public.scans enable row level security;
alter table public.consents enable row level security;
alter table public.source_evidence enable row level security;
alter table public.agent_findings enable row level security;
alter table public.documents enable row level security;
alter table public.reports enable row level security;

drop policy if exists "own scans" on public.scans;
create policy "own scans" on public.scans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own consents" on public.consents;
create policy "own consents" on public.consents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own evidence" on public.source_evidence;
create policy "own evidence" on public.source_evidence for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own findings" on public.agent_findings;
create policy "own findings" on public.agent_findings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own documents" on public.documents;
create policy "own documents" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own reports" on public.reports;
create policy "own reports" on public.reports for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Private storage bucket for uploaded documents (idempotent)
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do nothing;

-- ============================================================================
-- Match Agent: per-candidate classification + user corrections (idempotent)
-- match_status: unreviewed (default) | confirmed | possible | rejected
-- match_reviewed_by: agent (AI classification) | user (human correction)
-- ============================================================================
alter table public.source_evidence add column if not exists match_status text not null default 'unreviewed'
  check (match_status in ('unreviewed','confirmed','possible','rejected'));
alter table public.source_evidence add column if not exists match_quotes text[] not null default '{}';
alter table public.source_evidence add column if not exists match_conflicting text[] not null default '{}';
alter table public.source_evidence add column if not exists match_notes text;
alter table public.source_evidence add column if not exists match_similarity real;
alter table public.source_evidence add column if not exists match_reviewed_by text
  check (match_reviewed_by in ('agent','user'));
alter table public.source_evidence add column if not exists match_reviewed_at timestamptz;

-- ============================================================================
-- Search log: every attempted source/query and its retrieval outcome, so the
-- report can show which sources were searched and that "no result" is recorded
-- rather than silently dropped. (idempotent)
-- ============================================================================
create table if not exists public.search_log (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  query text,
  result_count integer not null default 0,
  outcome text not null default 'ok' check (outcome in ('ok','empty','failed')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_search_log_scan on public.search_log(scan_id);

alter table public.search_log enable row level security;
drop policy if exists "own search_log" on public.search_log;
create policy "own search_log" on public.search_log for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
