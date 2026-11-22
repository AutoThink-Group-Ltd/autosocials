-- Durable paid-operation reservation and super-admin production history.
-- No signed URLs, raw provider responses, prompts or credentials belong in this ledger.
alter table public.creative_variants add column if not exists production_plan jsonb not null default '{}'::jsonb;
alter table public.render_jobs add column if not exists production_state jsonb not null default '{}'::jsonb;
alter table public.render_jobs add column if not exists phase_claimed_at timestamptz;
-- Historical exports have not undergone the new review; only newly queued jobs start pending.
alter table public.render_jobs add column if not exists technical_status text not null default 'unverified'
  check (technical_status in ('pending','passed','needs_review','unverified','failed'));
alter table public.render_jobs add column if not exists creative_status text not null default 'unverified'
  check (creative_status in ('pending','passed','needs_review','unverified','failed'));

create table public.generation_steps (
  id uuid primary key default gen_random_uuid(),
  -- Retain billing/audit identities when users remove drafts, renders or workspaces.
  -- The insert trigger verifies live scope; intentionally no cascading subject FKs.
  render_job_id uuid not null,
  workspace_id uuid not null,
  variant_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  initiator text not null check (initiator in ('user','sam','legacy')),
  step_key text not null check (length(step_key) between 1 and 200),
  parent_step_id uuid references public.generation_steps(id),
  retry_of_step_id uuid references public.generation_steps(id),
  provider text not null, model text not null, model_version text, operation text not null,
  brief_summary text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  status text not null default 'reserved' check (status in ('reserved','submitted','running','completed','failed','reconciliation_required')),
  provider_job_id text, provider_request_id text,
  cost_kind text not null default 'unknown' check (cost_kind in ('known','estimate','unknown')),
  cost_amount numeric(18,8), cost_currency text,
  output_storage_path text check (output_storage_path is null or (output_storage_path !~* 'https?:|[?#]' and position('..' in output_storage_path) = 0)),
  error_code text,
  technical_status text not null default 'pending' check (technical_status in ('pending','passed','needs_review','unverified','failed')),
  creative_status text not null default 'pending' check (creative_status in ('pending','passed','needs_review','unverified','failed')),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected','unknown')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz, started_at timestamptz, completed_at timestamptz,
  constraint generation_steps_job_key unique (render_job_id, step_key),
  constraint generation_steps_cost check (
    (cost_kind = 'unknown' and cost_amount is null and cost_currency is null) or
    (cost_kind in ('known','estimate') and cost_amount >= 0 and cost_amount is not null and cost_currency ~ '^[A-Z]{3}$' and cost_currency is not null)
  )
);
create index generation_steps_history on public.generation_steps(created_at desc, id desc);
create index generation_steps_workspace on public.generation_steps(workspace_id, created_at desc);
create index generation_steps_status on public.generation_steps(status, provider);
create index generation_steps_parent on public.generation_steps(parent_step_id);
alter table public.generation_steps enable row level security;
revoke all on public.generation_steps from anon, authenticated;
grant select on public.generation_steps to authenticated;
grant select, insert, update on public.generation_steps to service_role;
create policy generation_steps_super_admin_read on public.generation_steps for select to authenticated
  using ((select public.has_role(auth.uid(), 'super_admin'::public.app_role)));
-- No client INSERT/UPDATE/DELETE policy or grant, including for super-admins.

-- A reservation is immutable with respect to its billing identity and render scope.
-- Reject accidental cross-workspace rows or retries/parents from another render chain.
create function public.validate_generation_step() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and not exists (select 1 from public.render_jobs r where r.id = new.render_job_id and r.workspace_id = new.workspace_id and r.variant_id = new.variant_id) then
    raise exception 'Generation step render scope mismatch';
  end if;
  if tg_op = 'UPDATE' and (new.render_job_id, new.workspace_id, new.variant_id, new.step_key, new.provider, new.model, new.operation)
    is distinct from (old.render_job_id, old.workspace_id, old.variant_id, old.step_key, old.provider, old.model, old.operation) then
    raise exception 'Generation billing identity is immutable';
  end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.submitted_at := coalesce(old.submitted_at,new.submitted_at);
    new.started_at := coalesce(old.started_at,new.started_at);
    new.completed_at := coalesce(old.completed_at,new.completed_at);
  end if;
  if new.parent_step_id is not null and not exists (select 1 from public.generation_steps p where p.id = new.parent_step_id and p.render_job_id = new.render_job_id and p.workspace_id = new.workspace_id and p.variant_id = new.variant_id) then
    raise exception 'Generation parent scope mismatch';
  end if;
  if new.retry_of_step_id is not null and not exists (select 1 from public.generation_steps p where p.id = new.retry_of_step_id and p.workspace_id = new.workspace_id and p.variant_id = new.variant_id) then
    raise exception 'Generation retry scope mismatch';
  end if;
  return new;
end $$;
revoke all on function public.validate_generation_step() from public, anon, authenticated;
create trigger generation_steps_scope before insert or update on public.generation_steps for each row execute function public.validate_generation_step();

-- Backfill every historical render, preserving each attempt, without inventing costs or reviews.
insert into public.generation_steps(render_job_id,workspace_id,variant_id,user_id,initiator,step_key,provider,model,operation,status,provider_job_id,output_storage_path,technical_status,creative_status,approval_status,created_at,updated_at,completed_at)
select r.id,r.workspace_id,r.variant_id,r.created_by,'legacy','legacy-render','legacy_unknown',coalesce(r.model,'legacy_unknown'),'render',
  case when r.status = 'done' then 'completed' when r.status in ('failed','error') then 'failed' else 'reconciliation_required' end,
  case when r.provider_job_id ~ '^[A-Za-z0-9_.:-]{1,200}$' then r.provider_job_id else null end,
  case when r.storage_path !~* 'https?:|[?#]' and position('..' in r.storage_path) = 0 then r.storage_path else null end,
  'unverified','unverified','unknown',r.created_at,r.updated_at,case when r.status in ('done','failed','error') then r.updated_at else null end
from public.render_jobs r on conflict (render_job_id,step_key) do nothing;

-- Invoker/RLS enforced aggregate: full matching history, never a truncated REST page.
create function public.generation_tracker_stats(p_status text default null,p_provider text default null,p_workspace_id uuid default null,p_render_job_id uuid default null,p_model text default null,p_operation text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with matching as (
    select * from public.generation_steps s
    where (p_status is null or s.status = p_status) and (p_provider is null or s.provider = p_provider)
      and (p_workspace_id is null or s.workspace_id = p_workspace_id) and (p_render_job_id is null or s.render_job_id = p_render_job_id)
      and (p_model is null or s.model = p_model) and (p_operation is null or s.operation = p_operation)
  ), totals as (
    select count(*) as total,count(*) filter (where status = 'completed') as completed,count(*) filter (where status = 'failed') as failed,
      count(*) filter (where status = 'reconciliation_required') as reconciliation_required,
      count(*) filter (where cost_kind = 'unknown') as unknown_cost,
      count(*) filter (where retry_of_step_id is not null) as retry_count,
      coalesce(round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*),0),2),0) as success_rate,
      coalesce(round(100.0 * count(*) filter (where status = 'failed') / nullif(count(*),0),2),0) as failure_rate,
      coalesce(round(100.0 * count(*) filter (where retry_of_step_id is not null) / nullif(count(*),0),2),0) as retry_rate,
      round(avg(extract(epoch from completed_at - coalesce(started_at,submitted_at,created_at))) filter (where completed_at is not null),2) as avg_elapsed_seconds,
      (select count(distinct m.render_job_id) from matching m join public.render_jobs r on r.id = m.render_job_id where r.status = 'done') as successful_videos
    from matching
  ), costs as (
    select cost_currency as currency,cost_kind as kind,sum(cost_amount) as amount from matching
    where cost_kind <> 'unknown' group by cost_currency,cost_kind
  ), grouped as (
    select provider,model,operation,count(*) as total,
      count(*) filter (where status = 'completed') as completed,count(*) filter (where status = 'failed') as failed,
      count(*) filter (where retry_of_step_id is not null) as retries,count(*) filter (where cost_kind = 'unknown') as unknown_cost,
      coalesce(round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*),0),2),0) as success_rate,
      coalesce(round(100.0 * count(*) filter (where status = 'failed') / nullif(count(*),0),2),0) as failure_rate,
      coalesce(round(100.0 * count(*) filter (where retry_of_step_id is not null) / nullif(count(*),0),2),0) as retry_rate,
      round(avg(extract(epoch from completed_at - coalesce(started_at,submitted_at,created_at))) filter (where completed_at is not null),2) as avg_elapsed_seconds
    from matching group by provider,model,operation
  ), grouped_costs as (
    select provider,model,operation,cost_currency as currency,cost_kind as kind,sum(cost_amount) as amount from matching
    where cost_kind <> 'unknown' group by provider,model,operation,cost_currency,cost_kind
  ), breakdown as (
    select to_jsonb(g) || jsonb_build_object('costs',coalesce((select jsonb_agg(jsonb_build_object('currency',c.currency,'kind',c.kind,'amount',c.amount)) from grouped_costs c
      where c.provider = g.provider and c.model = g.model and c.operation = g.operation),'[]'::jsonb)) as value from grouped g
  ) select to_jsonb(totals) || jsonb_build_object('costs',coalesce((select jsonb_agg(to_jsonb(costs)) from costs),'[]'::jsonb),
    'breakdown',coalesce((select jsonb_agg(value) from breakdown),'[]'::jsonb)) from totals;
$$;
revoke all on function public.generation_tracker_stats(text,text,uuid,uuid,text,text) from public, anon;
grant execute on function public.generation_tracker_stats(text,text,uuid,uuid,text,text) to authenticated, service_role;

-- Explicit human approval may accept unverified media, but cannot approve known critical defects.
-- Guard the tables as well as the app/RPC path. No historic approvals are rewritten.
create function public.guard_variant_generation_approval() returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  chosen public.render_jobs%rowtype;
begin
  if new.review_state is distinct from 'approved' or
    (old.review_state = 'approved' and new.primary_render_id is not distinct from old.primary_render_id) then
    return new;
  end if;
  if new.primary_render_id is not null then
    select * into chosen from public.render_jobs r where r.id = new.primary_render_id
      and r.variant_id = new.id and r.workspace_id = new.workspace_id for update;
  else
    select * into chosen from public.render_jobs r where r.variant_id = new.id and r.workspace_id = new.workspace_id
      and r.status = 'done' and r.storage_path is not null order by r.created_at desc,r.id desc limit 1 for update;
  end if;
  if chosen.id is null or chosen.status <> 'done' or chosen.storage_path is null then
    raise exception 'Choose a finished render before approval';
  end if;
  if chosen.technical_status in ('pending','needs_review','failed') or chosen.creative_status in ('pending','needs_review','failed')
    or chosen.frame_qa->>'status' = 'needs_review' or chosen.frame_qa->'after'->>'status' = 'needs_review'
    or chosen.frame_qa->'creative_review'->>'status' = 'needs_review' then
    raise exception 'Resolve known technical or creative defects before approval';
  end if;
  return new;
end $$;
revoke all on function public.guard_variant_generation_approval() from public,anon,authenticated;
create trigger guard_variant_generation_approval before update of review_state,primary_render_id on public.creative_variants
  for each row execute function public.guard_variant_generation_approval();

create function public.guard_render_generation_approval() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.brief_snapshot->>'review_state' = 'approved' and old.brief_snapshot->>'review_state' is distinct from 'approved' then
    if new.technical_status in ('pending','needs_review','failed') or new.creative_status in ('pending','needs_review','failed')
      or new.frame_qa->>'status' = 'needs_review' or new.frame_qa->'after'->>'status' = 'needs_review'
      or new.frame_qa->'creative_review'->>'status' = 'needs_review' then
      raise exception 'Resolve known technical or creative defects before approval';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_render_generation_approval() from public,anon,authenticated;
create trigger guard_render_generation_approval before update of brief_snapshot on public.render_jobs
  for each row execute function public.guard_render_generation_approval();
