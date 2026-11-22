create table if not exists public.platform_alert_log (
  alert_type text not null,
  alert_date date not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (alert_type, alert_date)
);

alter table public.platform_alert_log enable row level security;
revoke all on public.platform_alert_log from anon, authenticated;
grant all on public.platform_alert_log to service_role;

