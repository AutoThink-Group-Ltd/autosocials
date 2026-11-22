-- A displayed Stripe quote is bound to the requesting user and subscription.
create table public.content_credit_plan_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_subscription_id text not null,
  current_price_id text not null,
  target_price_id text not null,
  proration_at bigint not null,
  amount_due bigint not null check (amount_due >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  period_start bigint not null,
  period_end bigint not null check (period_end > period_start),
  expires_at timestamptz not null,
  status text not null default 'open' check (status in ('open','consumed','expired')),
  created_at timestamptz not null default now()
);
create index content_credit_plan_quotes_workspace on public.content_credit_plan_quotes(workspace_id, created_at desc);
alter table public.content_credit_plan_quotes enable row level security;
revoke all on public.content_credit_plan_quotes from public, anon, authenticated;
grant all on public.content_credit_plan_quotes to service_role;
