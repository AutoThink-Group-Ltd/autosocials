-- Rate versions are immutable once used; changing a rate creates a new row.
-- No rate is activated until its underlying provider costs are reviewed.
create table public.content_credit_rates (
  id uuid primary key default gen_random_uuid(),
  capability_id text not null check (length(capability_id) between 1 and 200),
  duration_s integer not null check (duration_s >= 0),
  credits integer not null check (credits > 0),
  active boolean not null default false,
  provider_cost_verified boolean not null default false,
  activation_approved boolean not null default false,
  evidence_note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (not active or ((provider_cost_verified or activation_approved) and length(coalesce(evidence_note, '')) > 0))
);
create unique index content_credit_one_active_rate on public.content_credit_rates(capability_id, duration_s) where active;
alter table public.content_credit_rates enable row level security;
revoke all on public.content_credit_rates from public, anon, authenticated;
grant all on public.content_credit_rates to service_role;

-- Proposed rates are recorded but remain inactive until evidence is reviewed.
insert into public.content_credit_rates(capability_id, duration_s, credits, evidence_note) values
  ('autotoast-hyperframes', 60, 50, 'Proposed planning rate; provider cost unverified'),
  ('golpo-canvas', 60, 150, 'Proposed planning rate; provider cost requires review'),
  ('golpo-sketch', 60, 150, 'Proposed planning rate; provider cost requires review'),
  ('higgsfield-video', 60, 400, 'User approved 400 credits despite one recorded 15-second request costing $14.50; underlying provider cost not verified'),
  ('higgsfield-video', 15, 100, 'User approved 100 credits for 15-second Higgsfield clips despite recorded $14.50 request'),
  ('higgsfield-video', 30, 200, 'User approved 200 credits for 30-second Higgsfield clips despite recorded $14.50 request'),
  ('heygen-avatar', 60, 200, 'Proposed planning rate; provider cost unverified'),
  ('openai-image', 0, 45, 'Proposed planning rate; provider cost requires review'),
  ('ideogram-image', 0, 30, 'Proposed planning rate; provider cost unverified'),
  ('recraft-image', 0, 24, 'Proposed planning rate; model cost unverified');
update public.content_credit_rates set active = true, activation_approved = true where capability_id = 'higgsfield-video' and duration_s in (15, 30, 60);

create function public.protect_content_credit_rate_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.id <> old.id or new.capability_id <> old.capability_id or new.duration_s <> old.duration_s or new.credits <> old.credits or new.created_at <> old.created_at then
    raise exception 'Create a new rate version instead of editing an existing price';
  end if;
  return new;
end $$;
create trigger content_credit_rate_version_immutable before update on public.content_credit_rates
for each row execute function public.protect_content_credit_rate_version();

create function public.publish_content_credit_rate(_user_id uuid, _capability_id text, _duration_s integer, _credits integer, _provider_cost_verified boolean, _evidence_note text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare new_id uuid;
begin
  if _user_id is null or not coalesce(public.has_role(_user_id, 'super_admin'::public.app_role), false) then raise exception 'Forbidden'; end if;
  if _capability_id is null or length(_capability_id) not between 1 and 200 or _duration_s is null or _duration_s < 0 or _credits is null or _credits <= 0 or _provider_cost_verified is null or length(trim(coalesce(_evidence_note, ''))) not between 5 and 1000 then raise exception 'Invalid credit rate'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_capability_id || ':' || _duration_s::text, 974));
  update public.content_credit_rates set active = false where capability_id = _capability_id and duration_s = _duration_s and active;
  insert into public.content_credit_rates(capability_id, duration_s, credits, active, provider_cost_verified, activation_approved, evidence_note, changed_by)
    values (_capability_id, _duration_s, _credits, true, _provider_cost_verified, not _provider_cost_verified, _evidence_note, _user_id) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.publish_content_credit_rate(uuid, text, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.publish_content_credit_rate(uuid, text, integer, integer, boolean, text) to service_role;

create function public.get_content_credit_rate(_capability_id text, _duration_s integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object('credits', credits, 'version', id::text)
  from public.content_credit_rates where capability_id = case when _capability_id like 'higgsfield-%' then 'higgsfield-video' else _capability_id end and duration_s = _duration_s and active and (provider_cost_verified or activation_approved)
$$;
revoke all on function public.get_content_credit_rate(text, integer) from public, anon, authenticated;
grant execute on function public.get_content_credit_rate(text, integer) to service_role;

-- Credit balances are partitioned by billing period. No client can grant or spend credits.
create table public.content_credit_periods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  granted integer not null check (granted >= 0),
  source_key text not null unique check (length(source_key) between 1 and 200),
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at),
  unique (workspace_id, id)
);

create table public.content_credit_reservations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_id uuid not null,
  request_key text not null check (length(request_key) between 1 and 200),
  credits integer not null check (credits > 0),
  rate_id uuid references public.content_credit_rates(id),
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'released', 'reconciliation_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, request_key),
  foreign key (workspace_id, period_id) references public.content_credit_periods(workspace_id, id)
);
create index content_credit_reservations_period on public.content_credit_reservations(period_id);

create table public.content_credit_adjustments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_id uuid not null,
  source_key text not null unique check (length(source_key) between 1 and 200),
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, period_id) references public.content_credit_periods(workspace_id, id)
);
create index content_credit_adjustments_period on public.content_credit_adjustments(period_id);
alter table public.content_credit_adjustments enable row level security;
revoke all on public.content_credit_adjustments from public, anon, authenticated;
grant select on public.content_credit_adjustments to authenticated;
grant all on public.content_credit_adjustments to service_role;
create policy content_credit_adjustment_member_read on public.content_credit_adjustments for select to authenticated
  using (public.can_access_workspace((select auth.uid()), workspace_id));

create table public.content_credit_preferences (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  automatic_upgrade boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.content_credit_preferences enable row level security;
revoke all on public.content_credit_preferences from public, anon, authenticated;
grant select on public.content_credit_preferences to authenticated;
grant all on public.content_credit_preferences to service_role;
create policy content_credit_preferences_member_read on public.content_credit_preferences for select to authenticated
  using (public.can_access_workspace((select auth.uid()), workspace_id));

create table public.content_credit_upgrades (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_id uuid not null,
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 200),
  stripe_invoice_id text unique,
  stripe_subscription_id text,
  stripe_price_id text,
  proration_at bigint,
  stripe_request_key text unique,
  from_plan text not null,
  to_plan text not null,
  delta_credits integer not null check (delta_credits > 0),
  status text not null default 'pending' check (status in ('pending', 'payment_pending', 'paid', 'failed', 'reconciliation_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, period_id) references public.content_credit_periods(workspace_id, id)
);
create unique index content_credit_one_open_upgrade on public.content_credit_upgrades(workspace_id)
  where status in ('pending', 'payment_pending', 'reconciliation_required');
alter table public.content_credit_upgrades enable row level security;
revoke all on public.content_credit_upgrades from public, anon, authenticated;
grant select on public.content_credit_upgrades to authenticated;
grant all on public.content_credit_upgrades to service_role;
create policy content_credit_upgrades_member_read on public.content_credit_upgrades for select to authenticated
  using (public.can_access_workspace((select auth.uid()), workspace_id));

-- Checkout and automatic upgrades share one durable workspace-wide claim.
create table public.content_credit_billing_operations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operation_key text not null unique check (length(operation_key) between 1 and 200),
  kind text not null check (kind in ('checkout', 'upgrade')),
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'failed', 'reconciliation_required')),
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index content_credit_one_billing_operation on public.content_credit_billing_operations(workspace_id) where status in ('open', 'reconciliation_required');
alter table public.content_credit_billing_operations enable row level security;
revoke all on public.content_credit_billing_operations from public, anon, authenticated;
grant all on public.content_credit_billing_operations to service_role;

create function public.claim_content_credit_billing_operation(_workspace_id uuid, _operation_key text, _kind text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare op public.content_credit_billing_operations%rowtype;
begin
  if _workspace_id is null or _operation_key is null or length(_operation_key) not between 1 and 200 or _kind not in ('checkout', 'upgrade') then raise exception 'Invalid billing operation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 973));
  select * into op from public.content_credit_billing_operations where operation_key = _operation_key;
  if found then
    if op.workspace_id <> _workspace_id or op.kind <> _kind then raise exception 'Billing operation mismatch'; end if;
    return pg_catalog.jsonb_build_object('id', op.id, 'status', op.status, 'external_id', op.external_id, 'reused', true);
  end if;
  if exists (select 1 from public.content_credit_billing_operations where workspace_id = _workspace_id and status in ('open', 'reconciliation_required')) then raise exception 'Another billing operation is pending'; end if;
  insert into public.content_credit_billing_operations(workspace_id, operation_key, kind) values (_workspace_id, _operation_key, _kind) returning * into op;
  return pg_catalog.jsonb_build_object('id', op.id, 'status', op.status, 'reused', false);
end $$;
revoke all on function public.claim_content_credit_billing_operation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_content_credit_billing_operation(uuid, text, text) to service_role;

create function public.resolve_content_credit_billing_operation(_id uuid, _status text, _external_id text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare op public.content_credit_billing_operations%rowtype;
begin
  if _status is null or _status not in ('completed', 'expired', 'failed', 'reconciliation_required') then raise exception 'Invalid billing resolution'; end if;
  select * into op from public.content_credit_billing_operations where id = _id for update;
  if not found then raise exception 'Billing operation not found'; end if;
  if op.external_id is not null and _external_id is not null and op.external_id <> _external_id then raise exception 'Billing operation external id mismatch'; end if;
  if op.status = _status then return pg_catalog.jsonb_build_object('status', op.status, 'reused', true); end if;
  if op.status not in ('open', 'reconciliation_required') then raise exception 'Billing operation already resolved'; end if;
  update public.content_credit_billing_operations set status = _status, external_id = coalesce(external_id, _external_id), updated_at = now() where id = op.id;
  return pg_catalog.jsonb_build_object('status', _status, 'reused', false);
end $$;
revoke all on function public.resolve_content_credit_billing_operation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_content_credit_billing_operation(uuid, text, text) to service_role;

-- Only Stripe identifiers are stored. Card details remain with Stripe.
create table public.credit_payment_customers (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text not null unique,
  setup_checkout_session_id text unique,
  setup_intent_id text unique,
  payment_method_id text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'revoked')),
  updated_at timestamptz not null default now()
);
alter table public.credit_payment_customers enable row level security;
revoke all on public.credit_payment_customers from public, anon, authenticated;
grant select on public.credit_payment_customers to authenticated;
grant all on public.credit_payment_customers to service_role;
create policy credit_payment_customers_owner_read on public.credit_payment_customers for select to authenticated
  using (public.is_workspace_owner((select auth.uid()), workspace_id));

-- One owner can establish a free allowance for one workspace, preventing
-- unlimited free balances merely by creating additional workspaces.
create table public.content_credit_free_eligibility (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.content_credit_free_eligibility enable row level security;
revoke all on public.content_credit_free_eligibility from public, anon, authenticated;
grant all on public.content_credit_free_eligibility to service_role;

alter table public.content_credit_periods enable row level security;
alter table public.content_credit_reservations enable row level security;
revoke all on public.content_credit_periods, public.content_credit_reservations from public, anon, authenticated;
grant select on public.content_credit_periods, public.content_credit_reservations to authenticated;
grant all on public.content_credit_periods, public.content_credit_reservations to service_role;
create policy content_credit_period_member_read on public.content_credit_periods for select to authenticated
  using (public.can_access_workspace((select auth.uid()), workspace_id));
create policy content_credit_reservation_member_read on public.content_credit_reservations for select to authenticated
  using (public.can_access_workspace((select auth.uid()), workspace_id));

-- Call only after verifying the grant's source, for example a paid Stripe invoice.
create function public.grant_content_credit_period(_workspace_id uuid, _starts_at timestamptz, _ends_at timestamptz, _granted integer, _source_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.content_credit_periods%rowtype;
begin
  if _workspace_id is null or _starts_at is null or _ends_at is null or _ends_at <= _starts_at or _granted is null or _granted < 0 or _source_key is null or length(_source_key) not between 1 and 200 then raise exception 'Invalid credit period'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
  select * into p from public.content_credit_periods where source_key = _source_key;
  if found then
    if p.workspace_id <> _workspace_id or p.starts_at <> _starts_at or p.ends_at <> _ends_at or p.granted - coalesce((select sum(credits) from public.content_credit_adjustments where period_id = p.id), 0) <> _granted then raise exception 'Credit grant source mismatch'; end if;
    return jsonb_build_object('period_id', p.id, 'reused', true);
  end if;
  if exists(select 1 from public.content_credit_periods where workspace_id = _workspace_id and starts_at < _ends_at and ends_at > _starts_at) then raise exception 'Credit periods overlap'; end if;
  insert into public.content_credit_periods(workspace_id, starts_at, ends_at, granted, source_key) values (_workspace_id, _starts_at, _ends_at, _granted, _source_key) returning * into p;
  return jsonb_build_object('period_id', p.id, 'reused', false);
end $$;
revoke all on function public.grant_content_credit_period(uuid, timestamptz, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.grant_content_credit_period(uuid, timestamptz, timestamptz, integer, text) to service_role;

-- A verified first payment ends a free period before the paid period starts.
-- Other overlapping paid periods must be handled as upgrades, not overwritten.
create function public.activate_paid_content_credit_period(_workspace_id uuid, _starts_at timestamptz, _ends_at timestamptz, _granted integer, _source_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.content_credit_periods%rowtype;
begin
  if _workspace_id is null or _starts_at is null or _ends_at is null or _ends_at <= _starts_at or _granted is null or _granted <= 0 or _source_key is null or length(_source_key) not between 1 and 200 then raise exception 'Invalid paid credit period'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
  select * into p from public.content_credit_periods where source_key = _source_key;
  if found then
    if p.workspace_id <> _workspace_id or p.starts_at <> _starts_at or p.ends_at <> _ends_at or p.granted - coalesce((select sum(credits) from public.content_credit_adjustments where period_id = p.id), 0) <> _granted then raise exception 'Credit grant source mismatch'; end if;
    return jsonb_build_object('period_id', p.id, 'reused', true);
  end if;
  select * into p from public.content_credit_periods where workspace_id = _workspace_id and starts_at < _ends_at and ends_at > _starts_at for update;
  if found then
    if p.source_key not like 'free:%' or p.starts_at > _starts_at then raise exception 'Credit periods overlap'; end if;
    update public.content_credit_periods set ends_at = _starts_at where id = p.id;
  end if;
  return public.grant_content_credit_period(_workspace_id, _starts_at, _ends_at, _granted, _source_key);
end $$;
revoke all on function public.activate_paid_content_credit_period(uuid, timestamptz, timestamptz, integer, text) from public, anon, authenticated;
grant execute on function public.activate_paid_content_credit_period(uuid, timestamptz, timestamptz, integer, text) to service_role;

-- Increment a current allowance only after the corresponding charge is verified.
create function public.add_content_credit_adjustment(_workspace_id uuid, _period_id uuid, _credits integer, _source_key text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a public.content_credit_adjustments%rowtype; p public.content_credit_periods%rowtype;
begin
  if _workspace_id is null or _period_id is null or _credits is null or _credits <= 0 or _source_key is null or length(_source_key) not between 1 and 200 then raise exception 'Invalid credit adjustment'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
  select * into a from public.content_credit_adjustments where source_key = _source_key;
  if found then
    if a.workspace_id <> _workspace_id or a.period_id <> _period_id or a.credits <> _credits then raise exception 'Credit adjustment source mismatch'; end if;
    return jsonb_build_object('adjustment_id', a.id, 'reused', true);
  end if;
  select * into p from public.content_credit_periods where id = _period_id and workspace_id = _workspace_id for update;
  if not found or p.starts_at > now() or p.ends_at <= now() then raise exception 'Credit period is not active'; end if;
  insert into public.content_credit_adjustments(workspace_id, period_id, source_key, credits) values (_workspace_id, _period_id, _source_key, _credits) returning * into a;
  update public.content_credit_periods set granted = granted + _credits where id = _period_id;
  return jsonb_build_object('adjustment_id', a.id, 'reused', false);
end $$;
revoke all on function public.add_content_credit_adjustment(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.add_content_credit_adjustment(uuid, uuid, integer, text) to service_role;

create function public.ensure_free_content_credit_period(_workspace_id uuid, _user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_uuid uuid; eligible_ws uuid; active_period uuid; period_start timestamptz; period_end timestamptz; source text;
begin
  if _workspace_id is null or _user_id is null or not coalesce(public.can_access_workspace(_user_id, _workspace_id), false) then raise exception 'Forbidden'; end if;
  select user_id into owner_uuid from public.workspace_members where workspace_id = _workspace_id and role = 'owner' order by user_id limit 1;
  if owner_uuid is null then raise exception 'Workspace owner not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_uuid::text, 972));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
  select id into active_period from public.content_credit_periods where workspace_id = _workspace_id and starts_at <= now() and ends_at > now() order by starts_at desc limit 1;
  if active_period is not null then return jsonb_build_object('period_id', active_period, 'reused', true); end if;
  if exists (select 1 from public.workspace_subscriptions where workspace_id = _workspace_id and subscription_status in ('active', 'trialing', 'past_due', 'unpaid', 'incomplete')) then raise exception 'Paid subscription requires a verified credit grant'; end if;
  insert into public.content_credit_free_eligibility(owner_id, workspace_id) values (owner_uuid, _workspace_id) on conflict (owner_id) do nothing;
  select workspace_id into eligible_ws from public.content_credit_free_eligibility where owner_id = owner_uuid;
  if eligible_ws is distinct from _workspace_id then raise exception 'Free credits are already assigned to another workspace'; end if;
  period_start := pg_catalog.date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  period_end := (pg_catalog.date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  select greatest(period_start, coalesce(max(ends_at), period_start)) into period_start from public.content_credit_periods where workspace_id = _workspace_id and starts_at < period_end;
  if period_start > now() or period_start >= period_end then raise exception 'Free credit period unavailable'; end if;
  source := 'free:' || owner_uuid::text || ':' || pg_catalog.to_char(now() at time zone 'UTC', 'YYYY-MM');
  return public.grant_content_credit_period(_workspace_id, period_start, period_end, 400, source);
end $$;
revoke all on function public.ensure_free_content_credit_period(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_free_content_credit_period(uuid, uuid) to service_role;

create function public.reserve_content_credits(_workspace_id uuid, _user_id uuid, _request_key text, _credits integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.content_credit_periods%rowtype; r public.content_credit_reservations%rowtype; used integer;
begin
  if _workspace_id is null or _user_id is null or not coalesce(public.can_access_workspace(_user_id, _workspace_id), false) then raise exception 'Forbidden'; end if;
  if _credits is null or _credits <= 0 or _request_key is null or length(_request_key) not between 1 and 200 then raise exception 'Invalid credit reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
  select * into r from public.content_credit_reservations where workspace_id = _workspace_id and request_key = _request_key;
  if found then
    if r.credits <> _credits then raise exception 'Reservation amount mismatch'; end if;
    return jsonb_build_object('reservation_id', r.id, 'state', r.state, 'reused', true);
  end if;
  select * into p from public.content_credit_periods where workspace_id = _workspace_id and starts_at <= now() and ends_at > now() order by starts_at desc limit 1 for update;
  if not found then raise exception 'No active credit period'; end if;
  select coalesce(sum(credits), 0) into used from public.content_credit_reservations where period_id = p.id and state in ('reserved', 'settled', 'reconciliation_required');
  if used + _credits > p.granted then raise exception 'Insufficient credits'; end if;
  insert into public.content_credit_reservations(workspace_id, period_id, request_key, credits) values (_workspace_id, p.id, _request_key, _credits) returning * into r;
  return jsonb_build_object('reservation_id', r.id, 'state', r.state, 'reused', false);
end $$;
revoke all on function public.reserve_content_credits(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_content_credits(uuid, uuid, text, integer) to service_role;

-- Recheck the exact rate version inside the same transaction as reservation.
create function public.reserve_priced_content_credits(_workspace_id uuid, _user_id uuid, _request_key text, _capability_id text, _duration_s integer, _rate_id uuid, _expected_credits integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actual integer; reservation jsonb; existing_rate uuid;
begin
  select credits into actual from public.content_credit_rates where id = _rate_id and capability_id = case when _capability_id like 'higgsfield-%' then 'higgsfield-video' else _capability_id end and duration_s = _duration_s and active and (provider_cost_verified or activation_approved) for share;
  if actual is null or actual <> _expected_credits then raise exception 'Credit price changed; review the new quote'; end if;
  reservation := public.reserve_content_credits(_workspace_id, _user_id, _request_key, actual);
  if (reservation ->> 'reused')::boolean then
    select rate_id into existing_rate from public.content_credit_reservations where id = (reservation ->> 'reservation_id')::uuid;
    if existing_rate is distinct from _rate_id then raise exception 'Reservation price version mismatch'; end if;
  else
    update public.content_credit_reservations set rate_id = _rate_id where id = (reservation ->> 'reservation_id')::uuid;
  end if;
  return reservation;
end $$;
revoke all on function public.reserve_priced_content_credits(uuid, uuid, text, text, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.reserve_priced_content_credits(uuid, uuid, text, text, integer, uuid, integer) to service_role;

-- Admission and credit reservation commit together: workers cannot see a queued
-- render until its reservation is durable. A failed reservation rolls back admission.
create function public.admit_credit_render(_variant_id uuid, _expected_version integer, _user_id uuid, _brief_snapshot jsonb, _revision_note text, _credits integer, _capability_id text, _duration_s integer, _rate_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare admission jsonb; reservation jsonb; render_uuid uuid; ws uuid;
begin
  admission := public.admit_creative_render(_variant_id, _expected_version, _user_id, _brief_snapshot, _revision_note);
  render_uuid := (admission ->> 'render_id')::uuid;
  select workspace_id into strict ws from public.render_jobs where id = render_uuid;
  reservation := public.reserve_priced_content_credits(ws, _user_id, 'render:' || render_uuid::text, _capability_id, _duration_s, _rate_id, _credits);
  if reservation ->> 'state' <> 'reserved' then raise exception 'Render reservation is no longer available'; end if;
  return admission || jsonb_build_object('reservation_id', reservation ->> 'reservation_id');
end $$;
revoke all on function public.admit_credit_render(uuid, integer, uuid, jsonb, text, integer, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.admit_credit_render(uuid, integer, uuid, jsonb, text, integer, text, integer, uuid) to service_role;

create function public.enqueue_credit_asset_revision(_variant_id uuid, _expected_version integer, _brief jsonb, _revision_note text, _user_id uuid, _credits integer, _capability_id text, _duration_s integer, _rate_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare admission jsonb; reservation jsonb; render_uuid uuid; ws uuid;
begin
  admission := public.enqueue_asset_revision(_variant_id, _expected_version, _brief, _revision_note, _user_id);
  render_uuid := (admission ->> 'render_id')::uuid;
  select workspace_id into strict ws from public.render_jobs where id = render_uuid;
  reservation := public.reserve_priced_content_credits(ws, _user_id, 'render:' || render_uuid::text, _capability_id, _duration_s, _rate_id, _credits);
  if reservation ->> 'state' <> 'reserved' then raise exception 'Render reservation is no longer available'; end if;
  return admission || jsonb_build_object('reservation_id', reservation ->> 'reservation_id');
end $$;
revoke all on function public.enqueue_credit_asset_revision(uuid, integer, jsonb, text, uuid, integer, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.enqueue_credit_asset_revision(uuid, integer, jsonb, text, uuid, integer, text, integer, uuid) to service_role;

-- Only a trusted worker may resolve a reservation; ambiguous outcomes stay held.
create function public.resolve_content_credit_reservation(_reservation_id uuid, _state text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.content_credit_reservations%rowtype;
begin
  if _state not in ('settled', 'released', 'reconciliation_required') then raise exception 'Invalid resolution'; end if;
  select * into r from public.content_credit_reservations where id = _reservation_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.state = _state then return jsonb_build_object('state', r.state, 'reused', true); end if;
  if r.state <> 'reserved' then raise exception 'Reservation requires reconciliation'; end if;
  update public.content_credit_reservations set state = _state, updated_at = now() where id = r.id;
  return jsonb_build_object('state', _state, 'reused', false);
end $$;
revoke all on function public.resolve_content_credit_reservation(uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_content_credit_reservation(uuid, text) to service_role;
