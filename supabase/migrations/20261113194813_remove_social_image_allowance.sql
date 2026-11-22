create or replace function public.admit_social_tile_image(_workspace_id uuid, _request_id uuid, _user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing boolean;
begin
  if _workspace_id is null or _request_id is null or _user_id is null
    or not coalesce(public.can_access_workspace(_user_id, _workspace_id), false) then
    raise exception 'Forbidden';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(_workspace_id::text, 0));
  select exists(select 1 from public.social_image_admissions where workspace_id = _workspace_id and request_id = _request_id) into existing;
  if existing then return jsonb_build_object('allowed', true, 'reused', true); end if;
  insert into public.social_image_admissions(workspace_id, request_id) values (_workspace_id, _request_id);
  return jsonb_build_object('allowed', true, 'reused', false);
end $$;
revoke all on function public.admit_social_tile_image(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admit_social_tile_image(uuid, uuid, uuid) to service_role;
