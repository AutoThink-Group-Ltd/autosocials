create extension if not exists pg_cron;
create extension if not exists pg_net;
create table if not exists public.internal_job_secrets (
  name text primary key,
  secret text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.internal_job_secrets enable row level security;
revoke all on public.internal_job_secrets from anon, authenticated;
grant all on public.internal_job_secrets to service_role;
insert into public.internal_job_secrets (name) values ('gsc_digest') on conflict do nothing;

-- Configure a scheduler for this installation before enabling digest delivery.
