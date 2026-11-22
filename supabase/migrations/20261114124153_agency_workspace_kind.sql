alter table public.agency_clients
  add column workspace_kind text not null default 'client'
  check (workspace_kind in ('client', 'agency', 'personal'));
