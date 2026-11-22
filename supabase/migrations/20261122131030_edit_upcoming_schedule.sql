-- Edit a reviewed snapshot of a schedule. The whole batch rolls back on a
-- conflict, and the claim worker cannot acquire a delivery during the edit.
create function public.edit_upcoming_schedule(
  _user_id uuid, _workspace_id uuid, _edits jsonb
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  entry record;
  p public.posts%rowtype;
  existing_ids uuid[];
  current_ids uuid[];
  added_ids uuid[];
  lock_account uuid;
  requires_review boolean;
begin
  if not coalesce(public.can_confirm_creation_schedule(_user_id, _workspace_id), false) then
    raise exception 'Workspace access denied';
  end if;
  if jsonb_typeof(_edits) is distinct from 'array' or jsonb_array_length(_edits) not between 1 and 1000 then
    raise exception 'Choose between 1 and 1,000 post changes';
  end if;
  if (select count(distinct e.id) from jsonb_to_recordset(_edits) e(id uuid)) <> jsonb_array_length(_edits) then
    raise exception 'Select each post only once';
  end if;
  select w.requires_approval into requires_review from public.workspaces w where w.id = _workspace_id for update nowait;
  if not found then raise exception 'Workspace access denied'; end if;

  for entry in
    select * from jsonb_to_recordset(_edits) as e(id uuid, scheduled_at timestamptz, account_ids uuid[], expected_updated_at timestamptz, expected_account_ids uuid[])
    order by id
  loop
    if not exists (select 1 from public.posts where id = entry.id and workspace_id = _workspace_id) then
      raise exception 'An upcoming post is no longer available. Reopen the editor.';
    end if;
    perform 1 from public.post_targets t where t.post_id = entry.id order by t.id for update nowait;
    select * into p from public.posts where id = entry.id and workspace_id = _workspace_id for update nowait;
    if not found or p.status <> 'scheduled' or p.scheduled_at is null or p.scheduled_at <= clock_timestamp()
      or p.published_at is not null or p.updated_at is distinct from entry.expected_updated_at then
      raise exception 'An upcoming post changed or started publishing. Reopen the editor.';
    end if;
    perform 1 from public.post_targets t where t.post_id = entry.id order by t.id for update nowait;
    if exists (select 1 from public.post_targets t where t.post_id = entry.id and
        (t.status <> 'pending' or coalesce(t.attempts, 0) <> 0 or t.lease_token is not null
         or t.submission_started_at is not null or t.platform_post_id is not null or t.published_at is not null)) then
      raise exception 'An upcoming post changed or started publishing. Reopen the editor.';
    end if;
    select array(select t.social_account_id from public.post_targets t where t.post_id = entry.id order by t.social_account_id) into existing_ids;
    if entry.expected_account_ids is null or existing_ids is distinct from array(select unnest(entry.expected_account_ids) order by 1) then
      raise exception 'The selected destinations changed. Reopen the editor.';
    end if;
    if entry.account_ids is null or cardinality(entry.account_ids) > 100
      or array_position(entry.account_ids, null) is not null
      or (select count(distinct unnest_id) from unnest(entry.account_ids) unnest_id) <> cardinality(entry.account_ids) then
      raise exception 'Invalid destinations';
    end if;
    if cardinality(entry.account_ids) = 0 then continue; end if;
    if requires_review then raise exception 'This workspace requires approval. Return the post to drafts to edit and submit it again.'; end if;
    if entry.scheduled_at is null or (entry.scheduled_at is distinct from p.scheduled_at and entry.scheduled_at < clock_timestamp() + interval '1 minute') then
      raise exception 'Choose a time at least one minute ahead';
    end if;
    select array(select unnest(entry.account_ids) except select unnest(existing_ids)) into added_ids;
    if (select count(*) from public.social_accounts a where a.id = any(added_ids) and a.workspace_id = _workspace_id
      and a.is_enabled and a.status = 'connected' and a.platform::text in ('facebook','instagram','linkedin','x','youtube')
      and (a.platform::text = 'youtube' or (a.platform::text <> 'linkedin' and a.expires_at is null) or a.expires_at > clock_timestamp()))
      <> cardinality(added_ids) then
      raise exception 'A new destination is unavailable. Check its connection and try again.';
    end if;
  end loop;

  for lock_account in
    select distinct unnest(e.account_ids || e.expected_account_ids)
    from jsonb_to_recordset(_edits) as e(account_ids uuid[], expected_account_ids uuid[]) order by 1
  loop
    if not pg_try_advisory_xact_lock(hashtextextended('autosocials:schedule:' || lock_account::text, 0)) then
      raise exception 'Another update is using this schedule. Refresh the planner before retrying.';
    end if;
  end loop;

  -- Release slots being moved before rebooking so a batch can swap times.
  -- The locks and transaction keep unslotted rows out of the worker's view.
  update public.posts moving set scheduled_at = null
    from jsonb_to_recordset(_edits) as e(id uuid, scheduled_at timestamptz, account_ids uuid[])
    where moving.id = e.id and cardinality(e.account_ids) > 0 and moving.scheduled_at is distinct from e.scheduled_at;

  -- Move posts with no destinations to drafts. Remove unwanted destinations
  -- before moving times so those bookings are released inside the same edit.
  for entry in select * from jsonb_to_recordset(_edits) as e(id uuid, account_ids uuid[]) order by id loop
    if cardinality(entry.account_ids) = 0 then
      update public.posts set status = 'draft', scheduled_at = null, approved_at = null, approved_by = null where id = entry.id;
    end if;
    delete from public.post_targets t where t.post_id = entry.id and not (t.social_account_id = any(entry.account_ids));
  end loop;

  for entry in select * from jsonb_to_recordset(_edits) as e(id uuid, scheduled_at timestamptz, account_ids uuid[]) order by scheduled_at, id loop
    if cardinality(entry.account_ids) = 0 then continue; end if;
    select * into p from public.posts where id = entry.id;
    select array(select t.social_account_id from public.post_targets t where t.post_id = entry.id) into current_ids;
    select array(select unnest(entry.account_ids) except select unnest(current_ids)) into added_ids;
    if exists (
      select 1 from public.posts prior join public.post_targets t on t.post_id = prior.id
      where prior.workspace_id = _workspace_id and prior.id <> p.id and t.social_account_id = any(added_ids)
        and ((p.variant_id is not null and prior.variant_id = p.variant_id)
          or (p.created_via like 'social_tile:%' and prior.created_via = p.created_via)
          or (p.created_via like 'written_post:%' and (prior.created_via = p.created_via or prior.id::text = split_part(p.created_via, ':', 2))))
        and (t.status = 'published' or (prior.status <> 'draft' and t.status in ('pending','publishing','retrying')))
    ) then
      raise exception 'This creation is already published or scheduled on a selected destination. Review its publishing history.';
    end if;
    insert into public.post_targets(post_id, social_account_id, platform)
      select entry.id, a.id, a.platform from public.social_accounts a
      where a.id = any(added_ids) and a.workspace_id = _workspace_id
      order by a.id;
    update public.posts set scheduled_at = entry.scheduled_at, approved_at = null, approved_by = null where id = entry.id;
  end loop;
  return jsonb_array_length(_edits);
exception when lock_not_available or deadlock_detected then
  raise exception 'Another update is using this schedule. Refresh the planner before retrying.';
end $$;

revoke all on function public.edit_upcoming_schedule(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.edit_upcoming_schedule(uuid, uuid, jsonb) to service_role;
