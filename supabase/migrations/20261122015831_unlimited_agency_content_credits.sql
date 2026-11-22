-- An explicit workspace entitlement. Agency membership alone never grants unlimited credits.
create table public.content_credit_unlimited_workspaces (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.content_credit_unlimited_workspaces enable row level security;
revoke all on public.content_credit_unlimited_workspaces from public, anon, authenticated;
grant select, insert, delete on public.content_credit_unlimited_workspaces to service_role;

-- Public source starts with no pre-granted workspace entitlements.

create or replace function public.ensure_free_content_credit_period(_workspace_id uuid, _user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare owner_uuid uuid; eligible_ws uuid; active_period uuid; period_start timestamptz; period_end timestamptz; source text;
begin
  if _workspace_id is null or _user_id is null or not coalesce(public.can_access_workspace(_user_id, _workspace_id), false) then raise exception 'Forbidden'; end if;

  -- Unlimited workspaces still use the existing reservation ledger.
  if exists (select 1 from public.content_credit_unlimited_workspaces where workspace_id = _workspace_id) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
    select id into active_period from public.content_credit_periods
      where workspace_id = _workspace_id and starts_at <= now() and ends_at > now()
      order by starts_at desc limit 1;
    if active_period is not null then
      return jsonb_build_object('period_id', active_period, 'reused', true, 'unlimited', true);
    end if;

    period_start := now();
    period_end := (pg_catalog.date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    select least(period_end, coalesce(min(starts_at), period_end)) into period_end
      from public.content_credit_periods where workspace_id = _workspace_id and starts_at > period_start;
    source := 'free:unlimited:' || _workspace_id::text || ':' || gen_random_uuid()::text;
    return public.grant_content_credit_period(_workspace_id, period_start, period_end, 0, source)
      || jsonb_build_object('unlimited', true);
  end if;

  -- Existing agency-managed workspaces need not have an individual owner yet.
  if exists (select 1 from public.workspace_subscriptions s where s.workspace_id = _workspace_id
    and s.courtesy_plan_key = 'pro' and (s.courtesy_plan_expires_at is null or s.courtesy_plan_expires_at > now())
    and s.stripe_subscription_id is null) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 971));
    select id into active_period from public.content_credit_periods where workspace_id = _workspace_id and starts_at <= now() and ends_at > now() order by starts_at desc limit 1;
    if active_period is not null then return jsonb_build_object('period_id', active_period, 'reused', true); end if;
    period_start := pg_catalog.date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    period_end := (pg_catalog.date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
    select greatest(period_start, coalesce(max(ends_at), period_start)) into period_start from public.content_credit_periods where workspace_id = _workspace_id and starts_at < period_end;
    if period_start > now() or period_start >= period_end then raise exception 'Complimentary credit period unavailable'; end if;
    source := 'courtesy-pro:' || _workspace_id::text || ':' || pg_catalog.to_char(now() at time zone 'UTC', 'YYYY-MM');
    return public.grant_content_credit_period(_workspace_id, period_start, period_end, 8000, source);
  end if;

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

create or replace function public.reserve_content_credits(_workspace_id uuid, _user_id uuid, _request_key text, _credits integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare p public.content_credit_periods%rowtype; r public.content_credit_reservations%rowtype; used bigint;
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
  if not exists (select 1 from public.content_credit_unlimited_workspaces where workspace_id = _workspace_id) then
    select coalesce(sum(credits), 0) into used from public.content_credit_reservations where period_id = p.id and state in ('reserved', 'settled', 'reconciliation_required');
    if used + _credits > p.granted then raise exception 'Insufficient credits'; end if;
  end if;
  insert into public.content_credit_reservations(workspace_id, period_id, request_key, credits) values (_workspace_id, p.id, _request_key, _credits) returning * into r;
  return jsonb_build_object('reservation_id', r.id, 'state', r.state, 'reused', false);
end $$;
