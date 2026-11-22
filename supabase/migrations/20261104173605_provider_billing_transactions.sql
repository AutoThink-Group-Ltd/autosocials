-- Provider deductions are evidence-backed records, separate from generation estimates.
create table public.provider_billing_transactions (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'higgsfield'),
  account_key text not null check (account_key ~ '^[a-zA-Z0-9_-]{1,80}$'),
  transaction_id text not null check (transaction_id ~ '^[a-zA-Z0-9_.:-]{1,200}$'),
  amount_usd numeric(18,2) not null check (amount_usd > 0 and amount_usd <= 1000000),
  currency text not null default 'USD' check (currency = 'USD'),
  transaction_type text not null default 'usage_charge' check (transaction_type = 'usage_charge'),
  occurred_on date not null,
  evidence_source text not null check (evidence_source in ('user_supplied_provider_billing_screenshot','provider_invoice','provider_receipt')),
  generation_step_id uuid references public.generation_steps(id),
  attribution_basis text not null default 'unlinked' check (attribution_basis in ('unlinked','single_request_reconciliation','manual_receipt_reconciliation')),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (provider, account_key, transaction_id),
  check ((generation_step_id is null and attribution_basis = 'unlinked') or (generation_step_id is not null and attribution_basis <> 'unlinked'))
);
create index provider_billing_transactions_date on public.provider_billing_transactions(provider, account_key, occurred_on desc);
create index provider_billing_transactions_step on public.provider_billing_transactions(generation_step_id) where generation_step_id is not null;
alter table public.provider_billing_transactions enable row level security;
revoke all on public.provider_billing_transactions from anon, authenticated, service_role;
grant select on public.provider_billing_transactions to authenticated;
grant select, insert on public.provider_billing_transactions to service_role;
create policy provider_billing_super_admin_read on public.provider_billing_transactions for select to authenticated
  using ((select public.has_role(auth.uid(), 'super_admin'::public.app_role)));
-- No client write grant or policy, including for super admins. The server checks
-- the current role before an immutable INSERT ... ON CONFLICT DO NOTHING.
