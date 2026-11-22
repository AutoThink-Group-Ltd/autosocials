-- Stable line identities allow completed provider work to stay charged while
-- definitely unsubmitted or failed work is released before an approved retry.
alter table public.content_credit_reservation_lines add column step_key text;
alter table public.content_credit_reservation_lines add column line_state text not null default 'held'
  check (line_state in ('held','settled','released','reconciliation_required'));
update public.content_credit_reservation_lines set step_key = 'legacy:' || ordinal::text where step_key is null;
alter table public.content_credit_reservation_lines alter column step_key set not null;
alter table public.content_credit_reservation_lines add constraint content_credit_reservation_step_unique unique(reservation_id, step_key);

create table public.content_credit_line_events (
  id bigint generated always as identity primary key,
  reservation_id uuid not null,
  ordinal integer not null,
  old_state text not null,
  new_state text not null,
  proof_step_id uuid references public.generation_steps(id),
  reason text not null,
  created_at timestamptz not null default now(),
  foreign key (reservation_id, ordinal) references public.content_credit_reservation_lines(reservation_id, ordinal)
);
alter table public.content_credit_line_events enable row level security;
revoke all on public.content_credit_line_events from public, anon, authenticated;
grant all on public.content_credit_line_events to service_role;
grant usage, select on sequence public.content_credit_line_events_id_seq to service_role;

create or replace function public.reserve_composite_content_credits(_workspace_id uuid, _user_id uuid, _request_key text, _lines jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; canonical jsonb := '[]'::jsonb; existing jsonb; rate_uuid uuid; capability text; step text; seen text[] := array[]::text[]; duration integer; quoted integer; actual integer; total bigint := 0; reservation jsonb;
begin
  if _lines is null or pg_catalog.jsonb_typeof(_lines) <> 'array' or pg_catalog.jsonb_array_length(_lines) not between 1 and 32 then raise exception 'Invalid credit quote'; end if;
  for item in select value from pg_catalog.jsonb_array_elements(_lines) loop
    if pg_catalog.jsonb_typeof(item) <> 'object' then raise exception 'Invalid credit quote'; end if;
    capability := item ->> 'capability_id'; step := item ->> 'step_key'; duration := (item ->> 'duration_s')::integer; quoted := (item ->> 'credits')::integer; rate_uuid := (item ->> 'rate_id')::uuid;
    if capability is null or step is null or step !~ '^(provider:[a-zA-Z0-9_-]{1,80}|compositor)$' or step = any(seen) or duration is null or quoted is null or rate_uuid is null then raise exception 'Invalid credit quote'; end if;
    seen := pg_catalog.array_append(seen, step);
    select credits into actual from public.content_credit_rates where id = rate_uuid and capability_id = case when duration > 0 and capability like 'higgsfield-%' then 'higgsfield-video' else capability end and duration_s = duration and active and (provider_cost_verified or activation_approved) for share;
    if actual is null or actual <> quoted then raise exception 'Credit price changed; review the new quote'; end if;
    total := total + actual;
    if total > 2147483647 then raise exception 'Credit quote is too large'; end if;
    canonical := canonical || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('step_key', step, 'capability_id', capability, 'duration_s', duration, 'rate_id', rate_uuid::text, 'credits', quoted));
  end loop;
  reservation := public.reserve_content_credits(_workspace_id, _user_id, _request_key, total::integer);
  if (reservation ->> 'reused')::boolean then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('step_key', step_key, 'capability_id', capability_id, 'duration_s', duration_s, 'rate_id', rate_id::text, 'credits', credits) order by ordinal), '[]'::jsonb)
      into existing from public.content_credit_reservation_lines where reservation_id = (reservation ->> 'reservation_id')::uuid;
    if existing <> canonical then raise exception 'Reservation price version mismatch'; end if;
  else
    insert into public.content_credit_reservation_lines(reservation_id, ordinal, step_key, capability_id, duration_s, rate_id, credits)
      select (reservation ->> 'reservation_id')::uuid, ordinality::integer, value ->> 'step_key', value ->> 'capability_id', (value ->> 'duration_s')::integer, (value ->> 'rate_id')::uuid, (value ->> 'credits')::integer
      from pg_catalog.jsonb_array_elements(canonical) with ordinality;
  end if;
  return reservation || pg_catalog.jsonb_build_object('credits', total);
end $$;

create function public.reconcile_failed_composite_credit_reservation(_reservation_id uuid)
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
    elsif g.status = 'failed' and g.provider_job_id is null and g.error_code in ('provider_rejected','authentication_failed','rate_limited','invalid_input','not_configured','production_preflight_failed','http_400','http_401','http_403','http_404','http_413','http_415','http_422','http_429') then
      next_state := 'released'; reason := 'Definitive failure before provider acceptance';
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
revoke all on function public.reconcile_failed_composite_credit_reservation(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_failed_composite_credit_reservation(uuid) to service_role;
