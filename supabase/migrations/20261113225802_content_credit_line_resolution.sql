-- Resolve the parent and its component lines together, keeping an audit trail.
create or replace function public.resolve_content_credit_reservation(_reservation_id uuid, _state text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare r public.content_credit_reservations%rowtype;
begin
  if _state is null or _state not in ('settled', 'released', 'reconciliation_required') then raise exception 'Invalid resolution'; end if;
  select * into r from public.content_credit_reservations where id = _reservation_id for update;
  if not found then raise exception 'Reservation not found'; end if;
  if r.state = _state then return jsonb_build_object('state', r.state, 'reused', true); end if;
  if r.state <> 'reserved' and not (r.state = 'reconciliation_required' and _state = 'settled') then raise exception 'Reservation requires reconciliation'; end if;
  if _state = 'released' and exists(select 1 from public.content_credit_reservation_lines where reservation_id = r.id and line_state = 'settled') then raise exception 'Completed credit lines cannot be released'; end if;
  insert into public.content_credit_line_events(reservation_id,ordinal,old_state,new_state,reason)
    select reservation_id,ordinal,line_state,_state,'Parent reservation resolved'
    from public.content_credit_reservation_lines where reservation_id = r.id and line_state in ('held','reconciliation_required') and line_state <> _state;
  update public.content_credit_reservation_lines set line_state = _state where reservation_id = r.id and line_state in ('held','reconciliation_required');
  update public.content_credit_reservations set state = _state, updated_at = now() where id = r.id;
  return jsonb_build_object('state', _state, 'reused', false);
end $$;

-- Recover a recorded completion if the application stopped before settling.
create or replace function public.reconcile_content_credit_completions()
returns integer language plpgsql security invoker set search_path = '' as $$
declare candidate uuid; resolved integer := 0;
begin
  for candidate in select r.id from public.content_credit_reservations r
    where r.state in ('reserved', 'reconciliation_required') and (
      (r.request_key ~ '^render:[0-9a-fA-F-]{36}$' and exists (
        select 1 from public.render_jobs j where j.id::text = substring(r.request_key from 8)
          and j.workspace_id = r.workspace_id and j.status = 'done' and j.storage_path is not null
      )) or
      (r.request_key ~ '^social-tile:[0-9a-fA-F-]{36}$' and exists (
        select 1 from public.brand_files f where f.id::text = substring(r.request_key from 13)
          and f.workspace_id = r.workspace_id and f.source = 'social_tile' and f.storage_path is not null
      )) or
      (r.request_key ~ '^social-background:[0-9a-fA-F-]{36}$' and exists (
        select 1 from public.brand_files f where f.workspace_id = r.workspace_id and f.source = 'ai-generated'
          and f.storage_path = r.workspace_id::text || '/social-tile-sources/' || substring(r.request_key from 19) || '.png'
      ))
    ) for update skip locked
  loop
    perform public.resolve_content_credit_reservation(candidate,'settled');
    resolved := resolved + 1;
  end loop;
  return resolved;
end $$;
