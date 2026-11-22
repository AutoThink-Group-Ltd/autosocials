-- 1. blocked_contacts table
create table public.blocked_contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  email text not null,
  reason text not null default 'bounce',
  details text,
  blocked_at timestamptz default now(),
  created_at timestamptz default now()
);

create unique index idx_blocked_email_ws on public.blocked_contacts(workspace_id, lower(email));

alter table public.blocked_contacts enable row level security;

create policy "Workspace members can view blocked contacts"
  on public.blocked_contacts for select to authenticated
  using (is_workspace_member(auth.uid(), workspace_id));

create policy "Workspace owners can manage blocked contacts"
  on public.blocked_contacts for all to authenticated
  using (is_workspace_owner(auth.uid(), workspace_id))
  with check (is_workspace_owner(auth.uid(), workspace_id));

-- 2. workspace_sending_metrics table
create table public.workspace_sending_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  metric_date date not null,
  emails_sent integer default 0,
  bounces integer default 0,
  spam_reports integer default 0,
  opens integer default 0,
  clicks integer default 0,
  unique (workspace_id, metric_date)
);

alter table public.workspace_sending_metrics enable row level security;

create policy "Workspace members can view sending metrics"
  on public.workspace_sending_metrics for select to authenticated
  using (is_workspace_member(auth.uid(), workspace_id));

create policy "Workspace owners can manage sending metrics"
  on public.workspace_sending_metrics for all to authenticated
  using (is_workspace_owner(auth.uid(), workspace_id))
  with check (is_workspace_owner(auth.uid(), workspace_id));

-- 3. Add sending_paused and pause_reason to workspace_sendgrid_config
alter table public.workspace_sendgrid_config
  add column if not exists sending_paused boolean not null default false,
  add column if not exists pause_reason text;