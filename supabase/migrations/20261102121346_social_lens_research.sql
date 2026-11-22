create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  query text not null check (char_length(query) between 2 and 500),
  question text not null default '' check (char_length(question) <= 8000),
  targets jsonb not null default '[]'::jsonb,
  posts jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  provider_runs jsonb not null default '{}'::jsonb,
  analysis jsonb,
  reply text check (char_length(reply) <= 5000),
  status text not null default 'queued' check (status in ('queued','fetching','analyzing','complete','partial','failed')),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_runs_workspace_created_idx on public.research_runs (workspace_id, created_at desc);
alter table public.research_runs enable row level security;
create policy research_runs_workspace_read on public.research_runs for select to authenticated
  using (public.can_access_workspace((select auth.uid()), workspace_id));
grant select on public.research_runs to authenticated;
revoke insert, update, delete on public.research_runs from anon, authenticated;
