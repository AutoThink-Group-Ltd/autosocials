-- Full matching-history statistics. Timings use immutable ledger completion events;
-- updated_at can change on approval and is never a finished-video timestamp.
-- Provider and compositor intervals include polling/ingestion/checks. Exact client
-- click, storage-only and per-Create batch-wave events are not recorded yet.
create or replace function public.generation_tracker_stats(
  p_status text default null, p_provider text default null,
  p_workspace_id uuid default null, p_render_job_id uuid default null,
  p_model text default null, p_operation text default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with matching as (
    select * from public.generation_steps s
    where (p_status is null or s.status = p_status) and (p_provider is null or s.provider = p_provider)
      and (p_workspace_id is null or s.workspace_id = p_workspace_id)
      and (p_render_job_id is null or s.render_job_id = p_render_job_id)
      and (p_model is null or s.model = p_model) and (p_operation is null or s.operation = p_operation)
  ), totals as (
    select count(*) as total, count(*) filter (where status = 'completed') as completed,
      count(*) filter (where status = 'failed') as failed,
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
    select cost_currency as currency, cost_kind as kind, sum(cost_amount) as amount from matching
    where cost_kind <> 'unknown' group by cost_currency,cost_kind
  ), grouped as (
    select provider, model, operation, count(*) as total,
      count(*) filter (where status = 'completed') as completed, count(*) filter (where status = 'failed') as failed,
      count(*) filter (where retry_of_step_id is not null) as retries,
      count(*) filter (where cost_kind = 'unknown') as unknown_cost,
      coalesce(round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*),0),2),0) as success_rate,
      coalesce(round(100.0 * count(*) filter (where status = 'failed') / nullif(count(*),0),2),0) as failure_rate,
      coalesce(round(100.0 * count(*) filter (where retry_of_step_id is not null) / nullif(count(*),0),2),0) as retry_rate,
      round(avg(extract(epoch from completed_at - coalesce(started_at,submitted_at,created_at))) filter (where completed_at is not null),2) as avg_elapsed_seconds
    from matching group by provider,model,operation
  ), grouped_costs as (
    select provider, model, operation, cost_currency as currency, cost_kind as kind, sum(cost_amount) as amount from matching
    where cost_kind <> 'unknown' group by provider,model,operation,cost_currency,cost_kind
  ), breakdown as (
    select to_jsonb(g) || jsonb_build_object('costs',coalesce((select jsonb_agg(jsonb_build_object('currency',c.currency,'kind',c.kind,'amount',c.amount)) from grouped_costs c
      where c.provider = g.provider and c.model = g.model and c.operation = g.operation),'[]'::jsonb)) as value from grouped g
  ), selected_renders as (
    select distinct render_job_id from matching
  ), chains as (
    -- Filters choose render chains. Every chain's timings include all of its steps,
    -- so filtering on a leaf provider cannot accidentally omit the production root.
    select s.* from public.generation_steps s join selected_renders r on r.render_job_id = s.render_job_id
  ), current_steps as (
    select * from chains where initiator <> 'legacy' and provider <> 'legacy_unknown'
  ), timing_values as (
    select 'production'::text as metric, extract(epoch from completed_at - created_at)::double precision as seconds
      from current_steps where step_key = 'production' and status = 'completed' and completed_at >= created_at
    union all
    select 'queue', extract(epoch from started_at - created_at)::double precision
      from current_steps where step_key = 'production' and started_at >= created_at
    union all
    select 'providerAndIngest', extract(epoch from completed_at - submitted_at)::double precision
      from current_steps where step_key like 'provider:%' and status = 'completed' and completed_at >= submitted_at
    union all
    select 'assemblyAndChecks', extract(epoch from completed_at - submitted_at)::double precision
      from current_steps where step_key = 'compositor' and status = 'completed' and completed_at >= submitted_at
  ), latency as (
    select metric, jsonb_build_object(
      'samples',count(*),
      'medianSeconds',round((percentile_cont(0.5) within group (order by seconds))::numeric,3),
      'p95Seconds',round((percentile_disc(0.95) within group (order by seconds))::numeric,3)
    ) as value from timing_values where seconds >= 0 group by metric
  ), render_states as (
    select r.id, r.status, r.phase, r.error, r.updated_at,
      exists(select 1 from chains s where s.render_job_id = r.id and s.status = 'reconciliation_required') as requires_reconciliation,
      exists(select 1 from chains s where s.render_job_id = r.id and (s.error_code ~* 'cancel(l)?ed' or s.error_code = 'provider_canceled')) as was_cancelled,
      exists(select 1 from chains s where s.render_job_id = r.id and (s.initiator = 'legacy' or s.provider = 'legacy_unknown')) as was_legacy
    from public.render_jobs r join selected_renders selected on selected.render_job_id = r.id
  ), production_counts as (
    select count(*) filter (where status = 'failed' and not was_cancelled) as failed,
      count(*) filter (where was_cancelled) as cancelled,
      count(*) filter (where status in ('queued','preparing','rendering')) as active,
      count(*) filter (where requires_reconciliation or phase = 'reconciliation_required') as reconciliation,
      count(*) filter (where status in ('queued','preparing','rendering') and updated_at <= now() - interval '10 minutes') as stale_active,
      count(*) filter (where was_legacy) as excluded_legacy
    from render_states
  ), production_stats as (
    select jsonb_build_object(
      'scope','matching_render_chains',
      'production',coalesce((select value from latency where metric = 'production'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
      'queue',coalesce((select value from latency where metric = 'queue'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
      'providerAndIngest',coalesce((select value from latency where metric = 'providerAndIngest'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
      'assemblyAndChecks',coalesce((select value from latency where metric = 'assemblyAndChecks'),'{"samples":0,"medianSeconds":null,"p95Seconds":null}'::jsonb),
      'failed',failed,'cancelled',cancelled,'active',active,'reconciliation',reconciliation,
      'staleActive',stale_active,'excludedLegacy',excluded_legacy,
      'clickToPlayableMeasured',false,'storageOnlyMeasured',false,'batchCompletionMeasured',false
    ) as value from production_counts
  )
  select to_jsonb(totals) || jsonb_build_object(
    'costs',coalesce((select jsonb_agg(to_jsonb(costs)) from costs),'[]'::jsonb),
    'breakdown',coalesce((select jsonb_agg(value) from breakdown),'[]'::jsonb),
    'productionStats',(select value from production_stats)
  ) from totals;
$$;
revoke all on function public.generation_tracker_stats(text,text,uuid,uuid,text,text) from public, anon;
grant execute on function public.generation_tracker_stats(text,text,uuid,uuid,text,text) to authenticated, service_role;
