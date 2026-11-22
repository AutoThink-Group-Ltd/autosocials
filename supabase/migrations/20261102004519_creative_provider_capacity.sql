-- Account/model capacity belongs to the server. These records contain no provider
-- credentials or request bodies. A lease may expire safely only before a ledger
-- reservation exists; an uncertain paid operation keeps its slot until reconciled.
create table public.creative_provider_slots (
  id uuid primary key default gen_random_uuid(),
  render_job_id uuid not null,
  workspace_id uuid not null,
  step_key text not null check (length(step_key) between 1 and 200),
  provider text not null check (provider ~ '^[a-z][a-z0-9_-]{0,39}$'),
  model text not null check (length(model) between 1 and 200),
  account_key text not null default 'default' check (account_key ~ '^[A-Za-z0-9_.-]{1,100}$'),
  state text not null default 'reserved' check (state in ('reserved','submitted','reconciliation_required','released')),
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  released_at timestamptz,
  unique (render_job_id, step_key)
);
create index creative_provider_slots_capacity on public.creative_provider_slots(provider, account_key, model)
  where state <> 'released';
alter table public.creative_provider_slots enable row level security;
revoke all on public.creative_provider_slots from public, anon, authenticated;
grant select, insert, update on public.creative_provider_slots to service_role;

-- The caller acquires capacity before beginStep. The unique generation_steps
-- reservation, not slot reuse, remains the authority for whether HTTP may be sent.
create function public.acquire_creative_provider_slot(
  _render_job_id uuid, _step_key text, _provider text, _model text,
  _provider_limit integer, _model_limit integer, _lease_seconds integer default 120,
  _account_key text default 'default'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  job public.render_jobs%rowtype;
  slot public.creative_provider_slots%rowtype;
  ledger public.generation_steps%rowtype;
  stamp timestamptz := clock_timestamp();
begin
  if _render_job_id is null or length(coalesce(_step_key,'')) not between 1 and 200
    or coalesce(_provider,'') !~ '^[a-z][a-z0-9_-]{0,39}$'
    or length(coalesce(_model,'')) not between 1 and 200
    or coalesce(_account_key,'') !~ '^[A-Za-z0-9_.-]{1,100}$'
    or _provider_limit is null or _provider_limit not between 1 and 64
    or _model_limit is null or _model_limit not between 1 and 64
    or _lease_seconds is null or _lease_seconds not between 30 and 600 then
    raise exception 'Invalid provider capacity request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(1782599953, pg_catalog.hashtext(_provider || ':' || _account_key));
  select * into job from public.render_jobs where id = _render_job_id;
  if not found then raise exception 'Production job not found'; end if;

  -- Terminal ledger entries are authoritative even when a worker crashed before
  -- explicitly releasing capacity. This never reopens their paid operation.
  update public.creative_provider_slots s set state = 'released', released_at = stamp, updated_at = stamp
    where s.provider = _provider and s.account_key = _account_key and s.state <> 'released'
      and exists (select 1 from public.generation_steps g where g.render_job_id = s.render_job_id
        and g.step_key = s.step_key and g.provider = s.provider and g.model = s.model
        and g.status in ('completed','failed'));
  -- A capacity claim with no ledger reservation cannot have submitted provider
  -- work under the required call order, so its short lease can be reclaimed.
  update public.creative_provider_slots s set state = 'released', released_at = stamp, updated_at = stamp
    where s.provider = _provider and s.account_key = _account_key and s.state = 'reserved'
      and s.lease_expires_at <= stamp
      and not exists (select 1 from public.generation_steps g where g.render_job_id = s.render_job_id and g.step_key = s.step_key);

  select * into slot from public.creative_provider_slots
    where render_job_id = _render_job_id and step_key = _step_key for update;
  select * into ledger from public.generation_steps
    where render_job_id = _render_job_id and step_key = _step_key;
  if ledger.id is not null and (ledger.provider <> _provider or ledger.model <> _model
    or ledger.workspace_id <> job.workspace_id) then raise exception 'Provider reservation identity mismatch'; end if;
  if slot.id is not null and (slot.provider <> _provider or slot.model <> _model
    or slot.account_key <> _account_key or slot.workspace_id <> job.workspace_id) then
    raise exception 'Provider capacity identity mismatch';
  end if;
  if ledger.id is not null and ledger.status in ('completed','failed') then
    return jsonb_build_object('acquired',false,'reused',true,'reason','terminal',
      'slot_id',slot.id,'lease_token',slot.lease_token);
  end if;
  if ledger.id is not null and (ledger.status = 'reconciliation_required'
    or ledger.provider_job_id is null) then
    insert into public.creative_provider_slots(render_job_id,workspace_id,step_key,provider,model,account_key,state,lease_expires_at)
      values(_render_job_id,job.workspace_id,_step_key,_provider,_model,_account_key,'reconciliation_required',stamp + pg_catalog.make_interval(secs => _lease_seconds))
      on conflict(render_job_id,step_key) do update set state = 'reconciliation_required', released_at = null,
        lease_expires_at = excluded.lease_expires_at, updated_at = stamp
      returning * into slot;
    return jsonb_build_object('acquired',false,'reused',true,'reason','reconciliation_required',
      'slot_id',slot.id,'lease_token',slot.lease_token);
  end if;
  if slot.id is not null and slot.state <> 'released' then
    update public.creative_provider_slots set
      state = case when ledger.provider_job_id is not null then 'submitted' else state end,
      lease_expires_at = stamp + pg_catalog.make_interval(secs => _lease_seconds), updated_at = stamp
      where id = slot.id;
    return jsonb_build_object('acquired',true,'reused',true,'reason','existing',
      'slot_id',slot.id,'lease_token',slot.lease_token);
  end if;
  -- Known provider jobs continue polling even if a prior slot row is missing.
  -- Capacity may be exceeded temporarily during repair, but no new HTTP is sent.
  if ledger.provider_job_id is not null then
    insert into public.creative_provider_slots(render_job_id,workspace_id,step_key,provider,model,account_key,state,lease_expires_at)
      values(_render_job_id,job.workspace_id,_step_key,_provider,_model,_account_key,'submitted',stamp + pg_catalog.make_interval(secs => _lease_seconds))
      on conflict(render_job_id,step_key) do update set state = 'submitted', released_at = null,
        lease_expires_at = excluded.lease_expires_at, updated_at = stamp
      returning * into slot;
    return jsonb_build_object('acquired',true,'reused',true,'reason','poll_existing',
      'slot_id',slot.id,'lease_token',slot.lease_token);
  end if;
  if job.status not in ('queued','preparing','rendering') then
    return jsonb_build_object('acquired',false,'reused',false,'reason','job_inactive','slot_id',null,'lease_token',null);
  end if;
  if (select count(*) from public.creative_provider_slots s where s.provider = _provider
    and s.account_key = _account_key and s.state <> 'released') >= _provider_limit
    or (select count(*) from public.creative_provider_slots s where s.provider = _provider
      and s.account_key = _account_key and s.model = _model and s.state <> 'released') >= _model_limit then
    return jsonb_build_object('acquired',false,'reused',false,'reason','capacity','slot_id',null,'lease_token',null);
  end if;
  insert into public.creative_provider_slots(render_job_id,workspace_id,step_key,provider,model,account_key,state,lease_expires_at)
    values(_render_job_id,job.workspace_id,_step_key,_provider,_model,_account_key,'reserved',stamp + pg_catalog.make_interval(secs => _lease_seconds))
    on conflict(render_job_id,step_key) do update set state = 'reserved', lease_token = gen_random_uuid(),
      released_at = null, lease_expires_at = excluded.lease_expires_at, updated_at = stamp
    returning * into slot;
  return jsonb_build_object('acquired',true,'reused',false,'reason','new',
    'slot_id',slot.id,'lease_token',slot.lease_token);
end $$;
revoke all on function public.acquire_creative_provider_slot(uuid,text,text,text,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.acquire_creative_provider_slot(uuid,text,text,text,integer,integer,integer,text) to service_role;

-- Mark submitted immediately before the paid HTTP request. A renewed lease is
-- diagnostic; submitted or ambiguous work is never expired into free capacity.
create function public.touch_creative_provider_slot(
  _slot_id uuid, _lease_token uuid, _submitted boolean default false, _lease_seconds integer default 120
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare slot public.creative_provider_slots%rowtype;
begin
  if _lease_seconds is null or _lease_seconds not between 30 and 600 or _submitted is null then raise exception 'Invalid provider lease'; end if;
  select * into slot from public.creative_provider_slots where id = _slot_id;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(1782599953, pg_catalog.hashtext(slot.provider || ':' || slot.account_key));
  select * into slot from public.creative_provider_slots where id = _slot_id for update;
  if slot.lease_token is distinct from _lease_token or slot.state = 'released' then return false; end if;
  if _submitted and not exists (select 1 from public.generation_steps g where g.render_job_id = slot.render_job_id
    and g.step_key = slot.step_key and g.provider = slot.provider and g.model = slot.model
    and g.status in ('reserved','submitted','running','reconciliation_required')) then
    raise exception 'Reserve the generation operation before provider submission';
  end if;
  update public.creative_provider_slots set state = case when _submitted then 'submitted' else state end,
    lease_expires_at = clock_timestamp() + pg_catalog.make_interval(secs => _lease_seconds), updated_at = clock_timestamp()
    where id = _slot_id;
  return true;
end $$;
revoke all on function public.touch_creative_provider_slot(uuid,uuid,boolean,integer) from public, anon, authenticated;
grant execute on function public.touch_creative_provider_slot(uuid,uuid,boolean,integer) to service_role;

-- Only definite terminal outcomes free paid capacity. No-ledger claims may be
-- released before submission; uncertain operations require provider reconciliation.
create function public.release_creative_provider_slot(_slot_id uuid, _lease_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare slot public.creative_provider_slots%rowtype;
begin
  select * into slot from public.creative_provider_slots where id = _slot_id;
  if not found then return false; end if;
  perform pg_catalog.pg_advisory_xact_lock(1782599953, pg_catalog.hashtext(slot.provider || ':' || slot.account_key));
  select * into slot from public.creative_provider_slots where id = _slot_id for update;
  if slot.lease_token is distinct from _lease_token then return false; end if;
  if slot.state = 'released' then return true; end if;
  if exists (select 1 from public.generation_steps g where g.render_job_id = slot.render_job_id
    and g.step_key = slot.step_key and (g.provider <> slot.provider or g.model <> slot.model
      or g.status not in ('completed','failed'))) then return false; end if;
  if slot.state <> 'reserved' and not exists (select 1 from public.generation_steps g
    where g.render_job_id = slot.render_job_id and g.step_key = slot.step_key and g.status in ('completed','failed')) then return false; end if;
  update public.creative_provider_slots set state = 'released', released_at = clock_timestamp(), updated_at = clock_timestamp() where id = _slot_id;
  return true;
end $$;
revoke all on function public.release_creative_provider_slot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.release_creative_provider_slot(uuid,uuid) to service_role;
