-- Keep an append-only record even when a planning job is requeued or work is trashed.
create table public.video_failure_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  batch_id uuid,
  variant_id uuid,
  job_id uuid not null,
  step_id uuid,
  retry_of_event_id uuid references public.video_failure_events(id),
  retry_of_step_id uuid,
  stage text not null check (stage in ('planning', 'production', 'provider')),
  style text,
  provider text,
  model text,
  provider_job_id text,
  provider_request_id text,
  error_code text,
  cause text not null,
  occurred_at timestamptz not null default now()
);
create index video_failure_events_workspace_time on public.video_failure_events(workspace_id, occurred_at desc, id desc);
create index video_failure_events_job on public.video_failure_events(workspace_id, job_id, occurred_at desc);
alter table public.video_failure_events enable row level security;
revoke all on public.video_failure_events from public, anon, authenticated, service_role;
grant select, insert on public.video_failure_events to service_role;
grant select on public.video_failure_events to authenticated;
create policy video_failure_events_super_admin_read on public.video_failure_events for select to authenticated
  using ((select public.has_role(auth.uid(), 'super_admin'::public.app_role)));

-- Do not store access-bearing URLs, authorization headers or key/value credentials.
create function public.clean_video_failure_cause(value text) returns text
language sql immutable set search_path = '' as $$
  select left(regexp_replace(regexp_replace(regexp_replace(
    coalesce(nullif(value, ''), 'Video creation could not finish.'),
    'https?://[^[:space:]<>"'']+', '[link removed]', 'gi'),
    '(bearer|authorization)[[:space:]:=]+[^[:space:],;]+', '\1 [redacted]', 'gi'),
    '(api[_ -]?key|token|secret|password)[[:space:]:=]+[^[:space:],;]+', '\1 [redacted]', 'gi'), 2000)
$$;
revoke all on function public.clean_video_failure_cause(text) from public, anon, authenticated;
grant execute on function public.clean_video_failure_cause(text) to service_role;

create function public.capture_planning_failure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare previous_id uuid; chosen_style text; intended_provider text; intended_model text;
begin
  if new.status <> 'failed' or (tg_op = 'UPDATE' and old.status = 'failed') then return new; end if;
  select id into previous_id from public.video_failure_events
    where workspace_id = new.workspace_id and job_id = new.id and stage = 'planning'
    order by occurred_at desc, id desc limit 1;
  chosen_style := coalesce(new.input #>> '{picked,0,asset_creation,recipe_id}', new.input #>> '{assets,0,style_id}', new.input #>> '{style_overrides,0}');
  intended_provider := case when chosen_style in ('branded-motion', 'brand-motion') then 'autotoast' when chosen_style = 'illustrated-explainer' then 'golpo' when chosen_style in ('cinematic-ad', 'cinematic-scene', 'reaction-demo', 'reference-story') then 'higgsfield' end;
  intended_model := case when chosen_style in ('branded-motion', 'brand-motion') then 'hyperframes' when chosen_style = 'illustrated-explainer' then 'golpo-canvas' when chosen_style in ('cinematic-ad', 'cinematic-scene') then 'bytedance/seedance-2.0/text-to-video' when chosen_style in ('reaction-demo', 'reference-story') then 'bytedance/seedance-2.5/reference-to-video' end;
  insert into public.video_failure_events(workspace_id, batch_id, job_id, retry_of_event_id, stage, style, provider, model, cause, occurred_at)
    values (new.workspace_id, new.batch_id, new.id, previous_id, 'planning', left(chosen_style, 100), intended_provider, intended_model, public.clean_video_failure_cause(new.error), coalesce(new.completed_at, now()));
  return new;
end $$;
revoke all on function public.capture_planning_failure() from public, anon, authenticated;
create trigger capture_planning_failure_event after insert or update of status on public.creative_planning_jobs
  for each row execute function public.capture_planning_failure();

create function public.capture_render_failure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v record; failed_step record; previous_id uuid; prior_step_id uuid;
begin
  if new.status <> 'failed' or (tg_op = 'UPDATE' and old.status = 'failed') then return new; end if;
  select batch_id, production_plan into v from public.creative_variants where id = new.variant_id and workspace_id = new.workspace_id;
  select provider, model, provider_job_id, provider_request_id, error_code, retry_of_step_id into failed_step
    from public.generation_steps where render_job_id = new.id and provider <> 'autosocials'
    order by (status in ('failed', 'reconciliation_required')) desc, updated_at desc limit 1;
  select retry_of_step_id into prior_step_id from public.generation_steps where render_job_id = new.id and step_key = 'production' limit 1;
  prior_step_id := coalesce(failed_step.retry_of_step_id, prior_step_id);
  if prior_step_id is not null then
    select e.id into previous_id from public.video_failure_events e join public.generation_steps s on s.render_job_id = e.job_id
      where s.id = prior_step_id and e.workspace_id = new.workspace_id and e.stage = 'production'
      order by e.occurred_at desc, e.id desc limit 1;
  end if;
  insert into public.video_failure_events(workspace_id, batch_id, variant_id, job_id, retry_of_event_id, retry_of_step_id, stage, style, provider, model, provider_job_id, provider_request_id, error_code, cause, occurred_at)
    values (new.workspace_id, v.batch_id, new.variant_id, new.id, previous_id, prior_step_id, 'production',
      left(coalesce(v.production_plan->>'recipe_id', v.production_plan #>> '{video_style,id}'), 100), left(failed_step.provider, 100),
      left(coalesce(failed_step.model, new.model), 200), left(coalesce(failed_step.provider_job_id, new.provider_job_id), 200),
      left(failed_step.provider_request_id, 200), left(failed_step.error_code, 200), public.clean_video_failure_cause(new.error), now());
  return new;
end $$;
revoke all on function public.capture_render_failure() from public, anon, authenticated;
create trigger capture_render_failure_event after insert or update of status on public.render_jobs
  for each row execute function public.capture_render_failure();

-- Individual provider failures retain the provider's request identity, including
-- uncertain submissions, even when the parent job is marked failed first.
create function public.capture_provider_failure() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v record; previous_id uuid;
begin
  if new.provider = 'autosocials' or new.status not in ('failed', 'reconciliation_required')
     or (tg_op = 'UPDATE' and old.status in ('failed', 'reconciliation_required')) then return new; end if;
  select batch_id, production_plan into v from public.creative_variants where id = new.variant_id and workspace_id = new.workspace_id;
  if new.retry_of_step_id is not null then
    select id into previous_id from public.video_failure_events where workspace_id = new.workspace_id and step_id = new.retry_of_step_id and stage = 'provider' order by occurred_at desc limit 1;
  end if;
  insert into public.video_failure_events(workspace_id, batch_id, variant_id, job_id, step_id, retry_of_event_id, retry_of_step_id, stage, style, provider, model, provider_job_id, provider_request_id, error_code, cause, occurred_at)
    values (new.workspace_id, v.batch_id, new.variant_id, new.render_job_id, new.id, previous_id, new.retry_of_step_id, 'provider',
      left(coalesce(v.production_plan->>'recipe_id', v.production_plan #>> '{video_style,id}'), 100), left(new.provider, 100), left(new.model, 200),
      left(new.provider_job_id, 200), left(new.provider_request_id, 200), left(new.error_code, 200), public.clean_video_failure_cause(new.error_code), coalesce(new.updated_at, now()));
  return new;
end $$;
revoke all on function public.capture_provider_failure() from public, anon, authenticated;
create trigger capture_provider_failure_event after insert or update of status on public.generation_steps
  for each row execute function public.capture_provider_failure();

-- Preserve failures still present at rollout; older overwritten attempts cannot be recovered.
insert into public.video_failure_events(workspace_id, batch_id, job_id, stage, style, cause, occurred_at)
select workspace_id, batch_id, id, 'planning', left(coalesce(input #>> '{picked,0,asset_creation,recipe_id}', input #>> '{assets,0,style_id}', input #>> '{style_overrides,0}'), 100),
       public.clean_video_failure_cause(error), coalesce(completed_at, updated_at)
from public.creative_planning_jobs where status = 'failed';
insert into public.video_failure_events(workspace_id, batch_id, variant_id, job_id, stage, style, model, provider_job_id, cause, occurred_at)
select r.workspace_id, v.batch_id, r.variant_id, r.id, 'production', left(coalesce(v.production_plan->>'recipe_id', v.production_plan #>> '{video_style,id}'), 100),
       left(r.model, 200), left(r.provider_job_id, 200), public.clean_video_failure_cause(r.error), r.updated_at
from public.render_jobs r left join public.creative_variants v on v.id = r.variant_id and v.workspace_id = r.workspace_id where r.status = 'failed';
