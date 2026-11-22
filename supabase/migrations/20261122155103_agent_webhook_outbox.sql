-- Server-only outbox. No browser role can read ciphertext, endpoint or delivery rows.
create table public.agent_webhook_subscriptions (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade, endpoint text not null, secret_ciphertext text not null,
 event_types text[] not null check (cardinality(event_types) between 1 and 20), enabled boolean not null default true,
 created_at timestamptz not null default now(), unique(id,workspace_id)
);
create table public.agent_webhook_deliveries (
 id uuid primary key default gen_random_uuid(), subscription_id uuid not null, workspace_id uuid not null,
 event_id uuid not null, event_type text not null, occurred_at timestamptz not null, subject_id uuid not null,
 status text not null default 'pending' check(status in ('pending','delivering','delivered','failed')),
 attempts integer not null default 0 check(attempts between 0 and 5), next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, last_http_status integer, created_at timestamptz not null default now(),
 foreign key(subscription_id,workspace_id) references public.agent_webhook_subscriptions(id,workspace_id) on delete cascade,
 unique(subscription_id,event_id)
);
create index agent_webhook_deliveries_due on public.agent_webhook_deliveries(next_attempt_at) where status in ('pending','delivering');
alter table public.agent_webhook_subscriptions enable row level security;
alter table public.agent_webhook_deliveries enable row level security;
revoke all on public.agent_webhook_subscriptions, public.agent_webhook_deliveries from public, anon, authenticated;
grant select, insert, update on public.agent_webhook_subscriptions, public.agent_webhook_deliveries to service_role;

-- Claims expire after two minutes; attempt counted at claim, including worker crashes.
create function public.agent_webhook_claim() returns setof public.agent_webhook_deliveries
language sql security invoker set search_path = '' as $$
 with chosen as (
   select d.id from public.agent_webhook_deliveries d
   join public.agent_webhook_subscriptions s on s.id=d.subscription_id and s.enabled
   where ((d.status='pending' and d.next_attempt_at<=now()) or (d.status='delivering' and d.lease_until<now())) and d.attempts<5
   order by d.next_attempt_at, d.id for update of d skip locked limit 1
 )
 update public.agent_webhook_deliveries d set status='delivering', attempts=d.attempts+1, lease_id=gen_random_uuid(), lease_until=now()+interval '2 minutes'
 from chosen where d.id=chosen.id returning d.*;
$$;
revoke all on function public.agent_webhook_claim() from public, anon, authenticated;
grant execute on function public.agent_webhook_claim() to service_role;
