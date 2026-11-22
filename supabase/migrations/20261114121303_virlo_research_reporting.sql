-- This function runs with invoker privileges. Only the application service role
-- may execute it; the server rechecks super-admin authorization before calling.
create function public.virlo_usage_summary(
  p_workspace_id uuid default null,
  p_user_id uuid default null,
  p_operation text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_before timestamptz default null
)
returns table (
  total bigint,
  reported_gross_usd numeric,
  reported_cost_count bigint,
  no_response_recorded_usd numeric,
  no_response_recorded_count bigint,
  estimated_only_usd numeric,
  estimated_only_count bigint,
  no_receipt_or_estimate_count bigint,
  unresolved_count bigint,
  reported_credits numeric,
  reported_credit_count bigint
)
language sql stable security invoker set search_path = '' as $$
  select count(*),
    coalesce(sum(a.cost_usd) filter (where a.provider_status is not null), 0),
    count(*) filter (where a.provider_status is not null and a.cost_usd is not null),
    coalesce(sum(a.cost_usd) filter (where a.provider_status is null), 0),
    count(*) filter (where a.provider_status is null and a.cost_usd is not null),
    coalesce(sum(a.estimated_cost_usd) filter (where a.cost_usd is null), 0),
    count(*) filter (where a.cost_usd is null and a.estimated_cost_usd is not null),
    count(*) filter (where a.cost_usd is null and a.estimated_cost_usd is null),
    count(*) filter (where a.status in ('started', 'unknown')),
    coalesce(sum(a.credits_used), 0),
    count(a.credits_used)
  from public.virlo_research_activity a
  where (p_workspace_id is null or a.workspace_id = p_workspace_id)
    and (p_user_id is null or a.user_id = p_user_id)
    and (p_operation is null or a.operation = p_operation)
    and (p_status is null or a.status = p_status)
    and (p_from is null or a.created_at >= p_from)
    and (p_before is null or a.created_at < p_before);
$$;
revoke all on function public.virlo_usage_summary(uuid, uuid, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.virlo_usage_summary(uuid, uuid, text, text, timestamptz, timestamptz) to service_role;
