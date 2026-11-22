-- ============================================================
-- Agent runtime: agent_runs + agent_trace_events
-- Phase 1 of agentic architecture retrofit.
-- ============================================================

-- Enum for agent run states (mirrors /state/README.md)
do $$ begin
  create type public.agent_run_state as enum (
    'draft',
    'awaiting_approval',
    'running',
    'blocked',
    'complete',
    'failed'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------
-- agent_runs
-- ----------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,            -- the user who initiated the run (auth.users.id)
  agent_id text not null,           -- e.g. 'vibe'
  skill_id text,                    -- e.g. 'outreach.draft_email'
  workflow_id text,                 -- e.g. 'outreach.send_campaign'
  state public.agent_run_state not null default 'draft',
  request jsonb,                    -- the user's intent (sanitised)
  response jsonb,                   -- the final user-visible result
  error_code text,
  error_message text,
  latency_ms integer,
  cost_usd numeric(12,6),
  prompt_version text,
  parent_run_id uuid references public.agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_runs_workspace_created_idx
  on public.agent_runs (workspace_id, created_at desc);
create index if not exists agent_runs_user_created_idx
  on public.agent_runs (user_id, created_at desc);
create index if not exists agent_runs_state_idx
  on public.agent_runs (state) where state in ('awaiting_approval','running','blocked');

alter table public.agent_runs enable row level security;

drop policy if exists "agent_runs read by workspace members" on public.agent_runs;
create policy "agent_runs read by workspace members"
  on public.agent_runs
  for select
  to authenticated
  using (
    public.is_workspace_member(auth.uid(), workspace_id)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- No insert/update/delete policies for authenticated users:
-- only the service role (edge functions) may write runs.

-- updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_agent_runs_updated_at on public.agent_runs;
create trigger update_agent_runs_updated_at
  before update on public.agent_runs
  for each row execute function public.update_updated_at_column();

-- ----------------------------------------------------------------
-- agent_trace_events  (append-only)
-- ----------------------------------------------------------------
create table if not exists public.agent_trace_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  seq integer not null,             -- ordering within the run
  kind text not null,               -- 'skill_invoked' | 'tool_called' | 'tool_result' | 'state_change' | 'error' | 'message' | 'confirmation_required' | 'confirmation_granted'
  name text,                        -- skill name, tool name, or state name
  inputs jsonb,                     -- sanitised inputs
  outputs jsonb,                    -- sanitised outputs
  ok boolean,
  error_code text,
  error_message text,
  latency_ms integer,
  cost_usd numeric(12,6),
  created_at timestamptz not null default now()
);

create index if not exists agent_trace_events_run_seq_idx
  on public.agent_trace_events (run_id, seq);
create index if not exists agent_trace_events_workspace_created_idx
  on public.agent_trace_events (workspace_id, created_at desc);
create index if not exists agent_trace_events_kind_idx
  on public.agent_trace_events (kind);

alter table public.agent_trace_events enable row level security;

drop policy if exists "agent_trace_events read by workspace members" on public.agent_trace_events;
create policy "agent_trace_events read by workspace members"
  on public.agent_trace_events
  for select
  to authenticated
  using (
    public.is_workspace_member(auth.uid(), workspace_id)
    or public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Append-only: no insert/update/delete policies for authenticated users.
-- Only the service role (edge functions) may write.