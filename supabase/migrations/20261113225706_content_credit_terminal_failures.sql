-- Release a line after a documented terminal provider response, even if the
-- provider issued a job id. Network and polling failures remain uncertain.
create or replace function public.reconcile_failed_composite_credit_reservation(_reservation_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.content_credit_reservations%rowtype; job public.render_jobs%rowtype; l public.content_credit_reservation_lines%rowtype; g public.generation_steps%rowtype; next_state text; reason text; remaining bigint; uncertain boolean := false; settled text[] := array[]::text[]; released text[] := array[]::text[];
begin
  select * into r from public.content_credit_reservations where id = _reservation_id for update;
  if not found or r.request_key !~ '^render:[0-9a-fA-F-]{36}$' then raise exception 'Render credit reservation not found'; end if;
  select * into job from public.render_jobs where id::text = substring(r.request_key from 8) and workspace_id = r.workspace_id for update;
  if not found or job.status <> 'failed' or job.phase_claimed_at is not null then raise exception 'Render is not safely stopped'; end if;
  if not exists(select 1 from public.content_credit_reservation_lines where reservation_id = r.id) then raise exception 'Composite reservation lines are missing'; end if;
  for l in select * from public.content_credit_reservation_lines where reservation_id = r.id order by ordinal for update loop
    if l.line_state in ('settled','released') then
      if l.line_state = 'settled' then settled := pg_catalog.array_append(settled,l.step_key); else released := pg_catalog.array_append(released,l.step_key); end if;
      continue;
    end if;
    select * into g from public.generation_steps where render_job_id = job.id and workspace_id = job.workspace_id and step_key = l.step_key order by created_at desc limit 1;
    if not found then
      next_state := 'released'; reason := 'No provider request recorded for stopped render'; g := null;
    elsif g.status = 'completed' and g.output_storage_path is not null and g.output_storage_path like job.workspace_id::text || '/renders/' || job.id::text || '/%' then
      next_state := 'settled'; reason := 'Verified saved provider output';
    elsif g.status = 'failed' and (
      (g.provider_job_id is null and g.error_code in ('provider_rejected','authentication_failed','rate_limited','invalid_input','not_configured','production_preflight_failed','http_400','http_401','http_403','http_404','http_413','http_415','http_422','http_429'))
      or (l.step_key like 'provider:%' and g.error_code = 'provider_terminal_failed')
      or (l.step_key = 'compositor' and g.error_code = 'compositor_failed')
    ) then
      next_state := 'released'; reason := 'Verified terminal failure';
    else
      next_state := 'reconciliation_required'; reason := 'Provider outcome requires review'; uncertain := true;
    end if;
    if l.line_state <> next_state then
      insert into public.content_credit_line_events(reservation_id,ordinal,old_state,new_state,proof_step_id,reason) values(r.id,l.ordinal,l.line_state,next_state,g.id,reason);
      update public.content_credit_reservation_lines set line_state = next_state where reservation_id = r.id and ordinal = l.ordinal;
    end if;
    if next_state = 'settled' then settled := pg_catalog.array_append(settled,l.step_key); elsif next_state = 'released' then released := pg_catalog.array_append(released,l.step_key); end if;
  end loop;
  select coalesce(sum(credits),0) into remaining from public.content_credit_reservation_lines where reservation_id = r.id and line_state <> 'released';
  update public.content_credit_reservations set credits = case when remaining > 0 then remaining::integer else credits end,
    state = case when uncertain then 'reconciliation_required' when remaining = 0 then 'released' else 'settled' end, updated_at = now() where id = r.id;
  return pg_catalog.jsonb_build_object('reservation_id',r.id,'state',case when uncertain then 'reconciliation_required' when remaining = 0 then 'released' else 'settled' end,'uncertain',uncertain,'settled_steps',settled,'released_steps',released);
end $$;
