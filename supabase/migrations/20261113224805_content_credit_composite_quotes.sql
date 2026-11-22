-- Preserve model-specific Higgsfield image prices: only video durations use
-- the owner-approved shared Higgsfield video rate.
create or replace function public.get_content_credit_rate(_capability_id text, _duration_s integer)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select pg_catalog.jsonb_build_object('credits', credits, 'version', id::text)
  from public.content_credit_rates where capability_id = case when _duration_s > 0 and _capability_id like 'higgsfield-%' then 'higgsfield-video' else _capability_id end
    and duration_s = _duration_s and active and (provider_cost_verified or activation_approved)
$$;

create or replace function public.reserve_priced_content_credits(_workspace_id uuid, _user_id uuid, _request_key text, _capability_id text, _duration_s integer, _rate_id uuid, _expected_credits integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare actual integer; reservation jsonb; existing_rate uuid;
begin
  select credits into actual from public.content_credit_rates where id = _rate_id and capability_id = case when _duration_s > 0 and _capability_id like 'higgsfield-%' then 'higgsfield-video' else _capability_id end and duration_s = _duration_s and active and (provider_cost_verified or activation_approved) for share;
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

create table public.content_credit_reservation_lines (
  reservation_id uuid not null references public.content_credit_reservations(id) on delete cascade,
  ordinal integer not null check (ordinal > 0),
  capability_id text not null,
  duration_s integer not null check (duration_s >= 0),
  rate_id uuid not null references public.content_credit_rates(id),
  credits integer not null check (credits > 0),
  primary key (reservation_id, ordinal)
);
alter table public.content_credit_reservation_lines enable row level security;
revoke all on public.content_credit_reservation_lines from public, anon, authenticated;
grant all on public.content_credit_reservation_lines to service_role;

create function public.reserve_composite_content_credits(_workspace_id uuid, _user_id uuid, _request_key text, _lines jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; canonical jsonb := '[]'::jsonb; existing jsonb; rate_uuid uuid; capability text; duration integer; quoted integer; actual integer; total bigint := 0; reservation jsonb;
begin
  if _lines is null or pg_catalog.jsonb_typeof(_lines) <> 'array' or pg_catalog.jsonb_array_length(_lines) not between 1 and 32 then raise exception 'Invalid credit quote'; end if;
  for item in select value from pg_catalog.jsonb_array_elements(_lines) loop
    if pg_catalog.jsonb_typeof(item) <> 'object' then raise exception 'Invalid credit quote'; end if;
    capability := item ->> 'capability_id'; duration := (item ->> 'duration_s')::integer; quoted := (item ->> 'credits')::integer; rate_uuid := (item ->> 'rate_id')::uuid;
    if capability is null or duration is null or quoted is null or rate_uuid is null then raise exception 'Invalid credit quote'; end if;
    select credits into actual from public.content_credit_rates where id = rate_uuid and capability_id = case when duration > 0 and capability like 'higgsfield-%' then 'higgsfield-video' else capability end and duration_s = duration and active and (provider_cost_verified or activation_approved) for share;
    if actual is null or actual <> quoted then raise exception 'Credit price changed; review the new quote'; end if;
    total := total + actual;
    if total > 2147483647 then raise exception 'Credit quote is too large'; end if;
    canonical := canonical || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('capability_id', capability, 'duration_s', duration, 'rate_id', rate_uuid::text, 'credits', quoted));
  end loop;
  reservation := public.reserve_content_credits(_workspace_id, _user_id, _request_key, total::integer);
  if (reservation ->> 'reused')::boolean then
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('capability_id', capability_id, 'duration_s', duration_s, 'rate_id', rate_id::text, 'credits', credits) order by ordinal), '[]'::jsonb)
      into existing from public.content_credit_reservation_lines where reservation_id = (reservation ->> 'reservation_id')::uuid;
    if existing <> canonical then raise exception 'Reservation price version mismatch'; end if;
  else
    insert into public.content_credit_reservation_lines(reservation_id, ordinal, capability_id, duration_s, rate_id, credits)
      select (reservation ->> 'reservation_id')::uuid, ordinality::integer, value ->> 'capability_id', (value ->> 'duration_s')::integer, (value ->> 'rate_id')::uuid, (value ->> 'credits')::integer
      from pg_catalog.jsonb_array_elements(canonical) with ordinality;
  end if;
  return reservation || pg_catalog.jsonb_build_object('credits', total);
end $$;
revoke all on function public.reserve_composite_content_credits(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.reserve_composite_content_credits(uuid, uuid, text, jsonb) to service_role;

create function public.admit_composite_credit_render(_variant_id uuid, _expected_version integer, _user_id uuid, _brief_snapshot jsonb, _revision_note text, _lines jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare admission jsonb; reservation jsonb; render_uuid uuid; ws uuid;
begin
  admission := public.admit_creative_render(_variant_id, _expected_version, _user_id, _brief_snapshot, _revision_note);
  render_uuid := (admission ->> 'render_id')::uuid;
  select workspace_id into strict ws from public.render_jobs where id = render_uuid;
  reservation := public.reserve_composite_content_credits(ws, _user_id, 'render:' || render_uuid::text, _lines);
  if reservation ->> 'state' <> 'reserved' then raise exception 'Render reservation is no longer available'; end if;
  return admission || pg_catalog.jsonb_build_object('reservation_id', reservation ->> 'reservation_id');
end $$;
revoke all on function public.admit_composite_credit_render(uuid, integer, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.admit_composite_credit_render(uuid, integer, uuid, jsonb, text, jsonb) to service_role;

create function public.enqueue_composite_credit_asset_revision(_variant_id uuid, _expected_version integer, _brief jsonb, _revision_note text, _user_id uuid, _lines jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare admission jsonb; reservation jsonb; render_uuid uuid; ws uuid;
begin
  admission := public.enqueue_asset_revision(_variant_id, _expected_version, _brief, _revision_note, _user_id);
  render_uuid := (admission ->> 'render_id')::uuid;
  select workspace_id into strict ws from public.render_jobs where id = render_uuid;
  reservation := public.reserve_composite_content_credits(ws, _user_id, 'render:' || render_uuid::text, _lines);
  if reservation ->> 'state' <> 'reserved' then raise exception 'Render reservation is no longer available'; end if;
  return admission || pg_catalog.jsonb_build_object('reservation_id', reservation ->> 'reservation_id');
end $$;
revoke all on function public.enqueue_composite_credit_asset_revision(uuid, integer, jsonb, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_composite_credit_asset_revision(uuid, integer, jsonb, text, uuid, jsonb) to service_role;
