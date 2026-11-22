-- Do not backfill invented historical request, storage or playback events.
alter table public.render_jobs
  add column server_request_started_at timestamptz,
  add column production_run_id uuid,
  add column storage_started_at timestamptz,
  add column storage_completed_at timestamptz,
  add column playback_ready_at timestamptz;
alter table public.render_jobs alter column server_request_started_at set default clock_timestamp();
alter table public.render_jobs alter column production_run_id set default gen_random_uuid();
create index render_jobs_production_run on public.render_jobs(workspace_id,production_run_id)
  where production_run_id is not null;

-- This metadata is constructed by the authenticated server, never accepted from
-- the user's brief. It enters the admission INSERT atomically, before workers run.
create function public.capture_creative_request_timestamps()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare request jsonb; received timestamptz; run_id uuid; expected integer;
begin
  if tg_op = 'UPDATE' then
    new.server_request_started_at := old.server_request_started_at;
    new.production_run_id := old.production_run_id;
    if old.brief_snapshot ? 'production_request' then
      new.brief_snapshot := coalesce(new.brief_snapshot,'{}'::jsonb)
        || jsonb_build_object('production_request',old.brief_snapshot->'production_request');
    else
      new.brief_snapshot := new.brief_snapshot - 'production_request';
    end if;
    return new;
  end if;
  request := new.brief_snapshot->'production_request';
  if request is null then return new; end if;
  if jsonb_typeof(request) <> 'object' or coalesce(request->>'run_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(request->>'server_received_at','') = ''
    or coalesce(request->>'expected_count','') !~ '^[1-4]$' then
    raise exception 'Invalid production request metadata';
  end if;
  begin
    run_id := (request->>'run_id')::uuid;
    received := (request->>'server_received_at')::timestamptz;
    expected := (request->>'expected_count')::integer;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid production request metadata';
  end;
  if not isfinite(received) or received > clock_timestamp() + interval '10 seconds'
    or received < clock_timestamp() - interval '1 hour' then
    raise exception 'Production request timestamp is outside the admission window';
  end if;
  new.server_request_started_at := received;
  new.production_run_id := run_id;
  return new;
end $$;
revoke all on function public.capture_creative_request_timestamps() from public, anon, authenticated;
grant execute on function public.capture_creative_request_timestamps() to service_role;
create trigger capture_creative_request_timestamps before insert on public.render_jobs
  for each row execute function public.capture_creative_request_timestamps();
create trigger preserve_creative_request_timestamps before update of brief_snapshot,server_request_started_at,production_run_id
  on public.render_jobs for each row execute function public.capture_creative_request_timestamps();

-- Revisions use the same trusted request envelope as first-time batch admission.
-- jsonb_populate_record deliberately ignores this envelope on the live variant;
-- preserve it separately on the immutable render brief instead.
create or replace function public.enqueue_asset_revision(
  _variant_id uuid, _expected_version integer, _brief jsonb, _revision_note text, _user_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v public.creative_variants%rowtype;
  revised public.creative_variants%rowtype;
  next_version integer;
  queued_id uuid;
  frozen jsonb;
begin
  select * into v from public.creative_variants where id = _variant_id for update;
  if not found or not coalesce(public.can_access_workspace(_user_id, v.workspace_id), false) then raise exception 'Forbidden'; end if;
  if _expected_version is null or v.version <> _expected_version then raise exception 'This asset changed while Sam was editing it. Refresh and try again.'; end if;
  if exists (select 1 from public.render_jobs where variant_id = v.id and status in ('queued','preparing','rendering')) then
    raise exception 'Sam is already editing this asset. Wait for the current version to finish.';
  end if;
  if _brief is null or jsonb_typeof(_brief) <> 'object' or length(coalesce(_revision_note,'')) not between 2 and 1000 then raise exception 'Invalid revision'; end if;
  revised := jsonb_populate_record(v,_brief);
  if length(trim(coalesce(revised.voiceover,''))) = 0 then raise exception 'Add a voiceover script first.'; end if;
  if revised.duration_s <= 0 or revised.duration_s > 120 then raise exception 'Invalid video duration'; end if;
  perform 1 from public.workspaces where id = v.workspace_id for update;
  select greatest(v.version,coalesce(max(version),0)) + 1 into next_version from public.render_jobs where variant_id = v.id;
  update public.creative_variants set
    hook = revised.hook, angle = revised.angle, narrative = revised.narrative, argument = revised.argument,
    format = revised.format, beats = revised.beats, voiceover = revised.voiceover, script = revised.script,
    caption = revised.caption, cta = revised.cta, duration_s = revised.duration_s, size = revised.size,
    voice_id = revised.voice_id, file_ids = revised.file_ids, captions = revised.captions,
    composition_html = revised.composition_html, build_prompt = revised.build_prompt,
    build_report = revised.build_report, design_mode = revised.design_mode, opening_visual = revised.opening_visual,
    production_plan = revised.production_plan,
    version = next_version, review_state = case when v.primary_render_id is null then 'needs_revision' else v.review_state end,
    review_note = case when v.primary_render_id is null then _revision_note else v.review_note end
  where id = v.id;
  frozen := public.asset_brief_snapshot(revised) || jsonb_build_object(
    'version',next_version,'review_state','draft','review_note',_revision_note,'production_plan',revised.production_plan
  );
  if _brief ? 'production_request' then
    frozen := frozen || jsonb_build_object('production_request',_brief->'production_request');
  end if;
  insert into public.render_jobs(
    workspace_id,variant_id,status,model,version,created_by,brief_snapshot,revision_note,
    production_state,phase,technical_status,creative_status
  ) values (
    v.workspace_id,v.id,'queued','autotoast-hyperframes',next_version,_user_id,frozen,_revision_note,
    jsonb_build_object('engine_version',1,'outputs','{}'::jsonb),'queued','pending','pending'
  ) returning id into queued_id;
  return jsonb_build_object('render_id',queued_id,'version',next_version);
end $$;
revoke all on function public.enqueue_asset_revision(uuid,integer,jsonb,text,uuid) from public,anon,authenticated;
grant execute on function public.enqueue_asset_revision(uuid,integer,jsonb,text,uuid) to service_role;

-- Preserve the existing all-history ledger aggregates and its invoker/RLS policy.
alter function public.generation_tracker_stats(text,text,uuid,uuid,text,text)
  rename to generation_tracker_step_stats;
create function public.generation_tracker_stats(
  p_status text default null, p_provider text default null,
  p_workspace_id uuid default null, p_render_job_id uuid default null,
  p_model text default null, p_operation text default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with base as (
    select public.generation_tracker_step_stats(p_status,p_provider,p_workspace_id,p_render_job_id,p_model,p_operation) as value
  ), selected_renders as (
    select distinct s.render_job_id from public.generation_steps s
    where (p_status is null or s.status = p_status) and (p_provider is null or s.provider = p_provider)
      and (p_workspace_id is null or s.workspace_id = p_workspace_id)
      and (p_render_job_id is null or s.render_job_id = p_render_job_id)
      and (p_model is null or s.model = p_model) and (p_operation is null or s.operation = p_operation)
  ), renders as (
    select r.* from public.render_jobs r join selected_renders selected on selected.render_job_id = r.id
  ), selected_runs as (
    select distinct workspace_id,production_run_id from renders where production_run_id is not null
  ), complete_runs as (
    -- Include every render admitted into the selected run, even when a provider
    -- filter matched only one sibling. A failed/incomplete sibling excludes the
    -- run's success latency but remains visible in the ledger failure counts.
    select r.workspace_id,r.production_run_id,
      min(r.server_request_started_at) as requested_at,max(r.playback_ready_at) as playable_at
    from public.render_jobs r join selected_runs selected
      on selected.workspace_id = r.workspace_id and selected.production_run_id = r.production_run_id
    group by r.workspace_id,r.production_run_id
    having bool_and(r.status = 'done' and r.playback_ready_at is not null and r.server_request_started_at is not null
      and r.playback_ready_at >= r.server_request_started_at
      and jsonb_typeof(r.brief_snapshot->'production_request') = 'object'
      and coalesce(r.brief_snapshot->'production_request'->>'expected_count','') ~ '^[1-4]$')
      and min(r.brief_snapshot->'production_request'->>'expected_count') = max(r.brief_snapshot->'production_request'->>'expected_count')
      and count(*) = case when min(r.brief_snapshot->'production_request'->>'expected_count') ~ '^[1-4]$'
        then min(r.brief_snapshot->'production_request'->>'expected_count')::integer else 0 end
  ), timing_values as (
    select 'serverRequestToPlayable'::text as metric,
      extract(epoch from playback_ready_at - server_request_started_at)::double precision as seconds
    from renders where status = 'done' and playback_ready_at >= server_request_started_at
      and jsonb_typeof(brief_snapshot->'production_request') = 'object'
    union all
    select 'storage',extract(epoch from storage_completed_at - storage_started_at)::double precision
      from renders where storage_completed_at >= storage_started_at
    union all
    select 'batchCompletion',extract(epoch from playable_at - requested_at)::double precision from complete_runs
  ), latency as (
    select metric,jsonb_build_object('samples',count(*),
      'medianSeconds',round((percentile_cont(0.5) within group(order by seconds))::numeric,3),
      'p95Seconds',round((percentile_disc(0.95) within group(order by seconds))::numeric,3)) as value
    from timing_values where seconds >= 0 group by metric
  )
  select jsonb_set(base.value,'{productionStats}',base.value->'productionStats' || jsonb_build_object(
    'serverRequestToPlayable',coalesce((select value from latency where metric = 'serverRequestToPlayable'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
    'batchCompletion',coalesce((select value from latency where metric = 'batchCompletion'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
    'storage',coalesce((select value from latency where metric = 'storage'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
    'serverRequestToPlayableMeasured',true,'clickToPlayableMeasured',false,
    'storageOnlyMeasured',true,'batchCompletionMeasured',true
  )) from base;
$$;
revoke all on function public.generation_tracker_stats(text,text,uuid,uuid,text,text) from public, anon;
grant execute on function public.generation_tracker_stats(text,text,uuid,uuid,text,text) to authenticated, service_role;
