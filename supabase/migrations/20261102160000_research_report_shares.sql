-- Public links resolve only through the server's token-hash lookup. The table itself is private.
create table public.research_report_shares (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  active_slot smallint not null check (active_slot between 1 and 10),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  brief_status text not null default 'pending' check (brief_status in ('pending', 'ready', 'unavailable')),
  trends jsonb not null default '[]'::jsonb check (jsonb_typeof(trends) = 'array'),
  trend_status text not null default 'pending' check (trend_status in ('pending', 'ready', 'unavailable')),
  niche text check (char_length(niche) <= 200),
  checked_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_report_shares_run_idx on public.research_report_shares (workspace_id, research_run_id, created_at desc);
create unique index research_report_shares_active_slot_idx on public.research_report_shares (workspace_id, research_run_id, active_slot) where revoked_at is null;
alter table public.research_report_shares enable row level security;
revoke all on public.research_report_shares from public, anon, authenticated;
grant select, insert, update, delete on public.research_report_shares to service_role;
