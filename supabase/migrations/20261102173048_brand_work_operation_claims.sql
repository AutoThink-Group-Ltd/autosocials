create table public.brand_work_operations (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null,
  signature text not null,
  token uuid not null,
  status text not null check (status in ('running', 'complete', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, kind, signature)
);
alter table public.brand_work_operations enable row level security;
revoke all on public.brand_work_operations from public, anon, authenticated;
grant all on public.brand_work_operations to service_role;
create index brand_work_operations_running_idx on public.brand_work_operations(workspace_id) where status = 'running';
