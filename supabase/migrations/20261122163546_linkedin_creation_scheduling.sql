-- Retain the reviewed carousel PDF as a private, first-class post attachment.
ALTER TYPE public.post_media_kind ADD VALUE IF NOT EXISTS 'document';

CREATE OR REPLACE FUNCTION public.commit_creation_schedule_item_v6(_request_id uuid, _hash text, _user_id uuid, _workspace_id uuid, _post_id uuid, _source text, _account_ids uuid[], _captions jsonb, _scheduled_at timestamp with time zone, _media_path text, _variant_id uuid, _render_id uuid, _immediate boolean, _repeat_accounts uuid[])
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE p public.posts%ROWTYPE; a record; approval_required boolean; account_count integer := 0; current_render uuid; current_review text; is_carousel boolean;
BEGIN
  PERFORM 1 FROM public.creation_schedule_requests WHERE request_id = _request_id AND workspace_id = _workspace_id AND user_id = _user_id AND payload_hash = _hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule request is unavailable'; END IF;
  IF NOT public.can_confirm_creation_schedule(_user_id, _workspace_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
  SELECT requires_approval INTO approval_required FROM public.workspaces WHERE id = _workspace_id FOR UPDATE;
  IF NOT FOUND OR approval_required THEN RAISE EXCEPTION 'This workspace requires post approval; prepare and approve posts through the normal publishing flow'; END IF;
  SELECT * INTO p FROM public.posts WHERE id = _post_id AND workspace_id = _workspace_id FOR UPDATE;
  IF NOT FOUND OR p.created_by <> _user_id OR p.created_via <> _source THEN RAISE EXCEPTION 'Draft does not match this request'; END IF;
  IF EXISTS (SELECT 1 FROM public.creation_schedule_receipts WHERE request_id = _request_id AND post_id = p.id) THEN
    IF p.status <> 'scheduled' AND NOT (_immediate AND p.status IN ('publishing', 'published', 'failed', 'partially_published', 'needs_attention')) THEN RAISE EXCEPTION 'This request already scheduled the post; inspect its current status before taking further action'; END IF;
    IF (NOT _immediate AND p.scheduled_at IS DISTINCT FROM _scheduled_at) OR (_immediate AND p.scheduled_at IS DISTINCT FROM (SELECT immediate_at FROM public.creation_schedule_receipts WHERE request_id = _request_id AND post_id = p.id)) OR
      (SELECT count(*) FROM public.post_targets WHERE post_id = p.id) <> cardinality(_account_ids) OR
      EXISTS (SELECT 1 FROM public.post_targets t WHERE t.post_id = p.id AND
        (NOT (t.social_account_id = ANY(_account_ids)) OR t.caption_override IS DISTINCT FROM _captions ->> t.platform)) THEN
      RAISE EXCEPTION 'Scheduled post changed; inspect it before retrying';
    END IF;
    RETURN 'scheduled';
  END IF;
  is_carousel := p.created_via LIKE 'linkedin_carousel:%';
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Post is no longer a draft'; END IF;
  IF _variant_id IS NOT NULL THEN
    PERFORM id FROM public.creative_variants WHERE id = _variant_id AND workspace_id = _workspace_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Video is unavailable'; END IF;
    SELECT r.id, COALESCE(r.brief_snapshot ->> 'review_state', v.review_state) INTO current_render, current_review
      FROM public.creative_variants v JOIN public.render_jobs r ON r.variant_id = v.id
      WHERE v.id = _variant_id AND r.status = 'done' AND r.storage_path IS NOT NULL
      ORDER BY (r.id = v.primary_render_id) DESC NULLS LAST, r.created_at DESC, r.id DESC LIMIT 1 FOR SHARE OF r;
    IF current_render IS DISTINCT FROM _render_id OR current_render IS NULL THEN RAISE EXCEPTION 'Video changed or is unavailable; review it before scheduling'; END IF;
  END IF;
  IF NOT _immediate AND _scheduled_at < now() + interval '1 minute' THEN RAISE EXCEPTION 'Choose a time at least one minute ahead'; END IF;
  IF cardinality(_account_ids) = 0 OR cardinality(_account_ids) <> (SELECT count(DISTINCT x) FROM unnest(_account_ids) x) THEN RAISE EXCEPTION 'Choose valid accounts'; END IF;
  PERFORM id FROM public.post_media WHERE post_id = p.id FOR UPDATE;
  IF (SELECT count(*) FROM public.post_media WHERE post_id = p.id) <> 1 OR NOT EXISTS (SELECT 1 FROM public.post_media WHERE post_id = p.id AND id = p.id AND storage_path = _media_path) THEN RAISE EXCEPTION 'Draft media changed; inspect it before scheduling'; END IF;
  IF is_carousel AND (
    _variant_id IS NOT NULL OR p.post_type <> 'carousel'
    OR _media_path NOT LIKE _workspace_id::text || '/creation-schedules/' || p.id::text || '/%.pdf'
    OR NOT EXISTS (SELECT 1 FROM public.post_media m WHERE m.post_id = p.id AND m.kind::text = 'document' AND m.mime = 'application/pdf')
  ) THEN RAISE EXCEPTION 'The draft needs a finished LinkedIn carousel PDF'; END IF;
  IF EXISTS (SELECT 1 FROM public.post_targets WHERE post_id = p.id) THEN RAISE EXCEPTION 'Draft targets changed; review the post before scheduling'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(_repeat_accounts, ARRAY[]::uuid[])) x WHERE NOT x = ANY(_account_ids)) THEN RAISE EXCEPTION 'Invalid repeat-post confirmation'; END IF;
  FOR a IN SELECT id, platform, is_enabled, status, expires_at FROM public.social_accounts WHERE id = ANY(_account_ids) AND workspace_id = _workspace_id FOR SHARE LOOP
    account_count := account_count + 1;
    IF NOT a.is_enabled OR a.status <> 'connected' OR (a.platform <> 'x' AND a.expires_at IS NOT NULL AND a.expires_at <= now()) OR a.platform NOT IN ('facebook','instagram','x','linkedin') THEN RAISE EXCEPTION 'A selected account is unavailable'; END IF;
    IF is_carousel AND a.platform <> 'linkedin' THEN RAISE EXCEPTION 'Carousel PDFs can only be scheduled to LinkedIn'; END IF;
    IF _variant_id IS NOT NULL AND a.platform = 'linkedin' AND current_review IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Approve the selected video before scheduling to LinkedIn'; END IF;
    IF jsonb_typeof(_captions -> a.platform) IS DISTINCT FROM 'string' OR (length(btrim(_captions ->> a.platform)) < 1 OR length(_captions ->> a.platform) > CASE WHEN a.platform = 'x' THEN 280 ELSE 2200 END) THEN RAISE EXCEPTION 'A platform caption is missing or too long'; END IF;
    -- The workspace row is locked above, serialising creation scheduling for this workspace.
    -- A failed/skipped target is retryable; a published or active target is a duplicate.
    IF NOT (a.id = ANY(COALESCE(_repeat_accounts, ARRAY[]::uuid[]))) AND EXISTS (
      SELECT 1 FROM public.posts previous JOIN public.post_targets target ON target.post_id = previous.id
      WHERE previous.workspace_id = _workspace_id AND previous.id <> p.id
        AND ((_variant_id IS NOT NULL AND previous.variant_id = _variant_id)
          OR (_variant_id IS NULL AND previous.created_via = _source))
        AND target.social_account_id = a.id
        AND (target.status = 'published' OR (target.status IN ('pending','retrying','publishing') AND previous.status <> 'draft'))
    ) THEN RAISE EXCEPTION 'This creation is already published or scheduled on a selected account. Review its publishing history before posting again'; END IF;
    INSERT INTO public.post_targets(post_id, social_account_id, platform, caption_override) VALUES (p.id, a.id, a.platform, _captions ->> a.platform);
  END LOOP;
  IF account_count <> cardinality(_account_ids) THEN RAISE EXCEPTION 'A selected account is unavailable'; END IF;
  PERFORM set_config('autosocials.repeat_accounts', array_to_string(COALESCE(_repeat_accounts, ARRAY[]::uuid[]), ','), true);
  UPDATE public.posts SET scheduled_at = CASE WHEN _immediate THEN now() ELSE _scheduled_at END, status = 'scheduled' WHERE id = p.id;
  INSERT INTO public.creation_schedule_receipts(request_id, post_id, immediate_at) VALUES (_request_id, p.id, CASE WHEN _immediate THEN now() ELSE NULL END);
  RETURN 'scheduled';
END $function$;

-- Edit a reviewed snapshot of a schedule. The whole batch rolls back on a
-- conflict, and the claim worker cannot acquire a delivery during the edit.
create or replace function public.edit_upcoming_schedule(
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
    if p.created_via like 'linkedin_carousel:%' and exists (
      select 1 from public.social_accounts a where a.id = any(added_ids) and a.platform <> 'linkedin'
    ) then raise exception 'Carousel PDFs can only be scheduled to LinkedIn'; end if;
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
          or ((p.created_via like 'social_tile:%' or p.created_via like 'linkedin_carousel:%') and prior.created_via = p.created_via)
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
