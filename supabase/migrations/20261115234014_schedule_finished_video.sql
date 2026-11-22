CREATE OR REPLACE FUNCTION public.commit_creation_schedule_item_v6(_request_id uuid, _hash text, _user_id uuid, _workspace_id uuid, _post_id uuid, _source text, _account_ids uuid[], _captions jsonb, _scheduled_at timestamptz, _media_path text, _variant_id uuid, _render_id uuid, _immediate boolean, _repeat_accounts uuid[])
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE p public.posts%ROWTYPE; a record; approval_required boolean; account_count integer := 0; current_render uuid; current_review text;
BEGIN
  PERFORM 1 FROM public.creation_schedule_requests WHERE request_id = _request_id AND workspace_id = _workspace_id AND user_id = _user_id AND payload_hash = _hash FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule request is unavailable'; END IF;
  IF NOT public.is_workspace_member(_user_id, _workspace_id) THEN RAISE EXCEPTION 'Workspace access denied'; END IF;
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
  IF EXISTS (SELECT 1 FROM public.post_targets WHERE post_id = p.id) THEN RAISE EXCEPTION 'Draft targets changed; review the post before scheduling'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(_repeat_accounts, ARRAY[]::uuid[])) x WHERE NOT x = ANY(_account_ids)) THEN RAISE EXCEPTION 'Invalid repeat-post confirmation'; END IF;
  FOR a IN SELECT id, platform, is_enabled, status, expires_at FROM public.social_accounts WHERE id = ANY(_account_ids) AND workspace_id = _workspace_id FOR SHARE LOOP
    account_count := account_count + 1;
    IF NOT a.is_enabled OR a.status <> 'connected' OR (a.platform <> 'x' AND a.expires_at IS NOT NULL AND a.expires_at <= now()) OR a.platform NOT IN ('facebook','instagram','x') THEN RAISE EXCEPTION 'A selected account is unavailable'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.commit_creation_schedule_item_v6(uuid,text,uuid,uuid,uuid,text,uuid[],jsonb,timestamptz,text,uuid,uuid,boolean,uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_creation_schedule_item_v6(uuid,text,uuid,uuid,uuid,text,uuid[],jsonb,timestamptz,text,uuid,uuid,boolean,uuid[]) TO service_role;



