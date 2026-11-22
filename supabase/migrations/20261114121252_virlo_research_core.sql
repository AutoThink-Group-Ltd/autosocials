-- Provider records are written only by the server after workspace authorization.
create table public.virlo_research_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  operation text not null,
  request_id uuid,
  request_hash text,
  status text not null check (status in ('started', 'completed', 'failed', 'unknown')),
  provider_status integer,
  provider_resource_id uuid,
  operation_meta jsonb,
  estimated_cost_usd numeric(16, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  cost_usd numeric(16, 6) check (cost_usd is null or cost_usd >= 0),
  credits_used numeric(16, 6) check (credits_used is null or credits_used >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index virlo_research_activity_workspace_created on public.virlo_research_activity(workspace_id, created_at desc);
create unique index virlo_research_activity_request on public.virlo_research_activity(workspace_id, request_id) where request_id is not null;
alter table public.virlo_research_activity enable row level security;
revoke all on public.virlo_research_activity from anon, authenticated;
grant select, insert, update on public.virlo_research_activity to service_role;

create table public.virlo_research_results (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  activity_id uuid references public.virlo_research_activity(id) on delete set null,
  kind text not null check (length(kind) between 1 and 60),
  title text not null check (length(title) between 1 and 200),
  result jsonb not null,
  saved boolean not null default false,
  created_at timestamptz not null default now()
);
create index virlo_research_results_workspace_saved on public.virlo_research_results(workspace_id, created_at desc) where saved;
alter table public.virlo_research_results enable row level security;
revoke all on public.virlo_research_results from anon, authenticated;
grant select, insert, update on public.virlo_research_results to service_role;

create table public.virlo_research_resources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider_id uuid not null,
  kind text not null check (kind in ('lookup_creator', 'lookup_video', 'lookup_hashtag', 'lookup_sound', 'lookup_place', 'research', 'creators', 'videos')),
  label text not null,
  cadence text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, provider_id)
);
alter table public.virlo_research_resources enable row level security;
revoke all on public.virlo_research_resources from anon, authenticated;
grant select, insert, update on public.virlo_research_resources to service_role;
create index virlo_research_resources_workspace on public.virlo_research_resources(workspace_id, created_at desc);
