-- Change one destination on upcoming posts without moving their slots or
-- touching any delivery that has been claimed, attempted, or published.
create function public.bulk_remove_scheduled_destination(
  _user_id uuid, _workspace_id uuid, _account_id uuid, _post_ids uuid[], _draft_last boolean
) returns table (post_id uuid, outcome text)
language plpgsql security invoker set search_path = '' as $$
declare
  candidate uuid;
  post_row public.posts%rowtype;
  deleted_count integer;
begin
  if not coalesce(public.can_confirm_creation_schedule(_user_id, _workspace_id), false) then
    raise exception 'Workspace access denied';
  end if;
  if coalesce(cardinality(_post_ids), 0) not between 1 and 1000 or array_position(_post_ids, null) is not null then
    raise exception 'Select between 1 and 1,000 upcoming posts';
  end if;
  if not exists (select 1 from public.social_accounts a where a.id = _account_id and a.workspace_id = _workspace_id) then
    raise exception 'This destination is unavailable in the workspace';
  end if;
  for candidate in select distinct unnest(_post_ids) order by 1 loop
    post_id := candidate;
    begin
      -- Check scope before locking targets. Follow the publisher's target
      -- locks first, and skip any row currently being changed.
      if not exists (select 1 from public.posts p where p.id = candidate and p.workspace_id = _workspace_id) then
        outcome := 'unavailable';
        return next;
        continue;
      end if;
      perform 1 from public.post_targets t where t.post_id = candidate order by t.id for update nowait;
      select p.* into post_row from public.posts p where p.id = candidate and p.workspace_id = _workspace_id for update nowait;
      if not found or post_row.status <> 'scheduled' or post_row.scheduled_at is null
        or post_row.scheduled_at <= clock_timestamp() or post_row.published_at is not null then
        outcome := 'unavailable';
        return next;
        continue;
      end if;
      perform 1 from public.post_targets t where t.post_id = candidate order by t.id for update nowait;
      if exists (select 1 from public.post_targets t where t.post_id = candidate and
          (t.status <> 'pending' or coalesce(t.attempts, 0) <> 0 or t.lease_token is not null
           or t.submission_started_at is not null or t.platform_post_id is not null or t.published_at is not null)) then
        outcome := 'unavailable';
      elsif not exists (select 1 from public.post_targets t where t.post_id = candidate and t.social_account_id = _account_id) then
        outcome := 'already_removed';
      elsif not exists (select 1 from public.post_targets t where t.post_id = candidate and t.social_account_id <> _account_id) then
        if _draft_last is true then
          update public.posts p set status = 'draft', scheduled_at = null,
            approved_at = null, approved_by = null where p.id = candidate;
          delete from public.post_targets t where t.post_id = candidate and t.social_account_id = _account_id;
          outcome := 'returned_to_drafts';
        else
          outcome := 'last_destination';
        end if;
      else
        delete from public.post_targets t where t.post_id = candidate and t.social_account_id = _account_id;
        get diagnostics deleted_count = row_count;
        outcome := case when deleted_count > 0 then 'removed' else 'already_removed' end;
      end if;
    exception when lock_not_available then
      outcome := 'unavailable';
    end;
    return next;
  end loop;
end $$;

revoke all on function public.bulk_remove_scheduled_destination(uuid, uuid, uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.bulk_remove_scheduled_destination(uuid, uuid, uuid, uuid[], boolean) to service_role;
