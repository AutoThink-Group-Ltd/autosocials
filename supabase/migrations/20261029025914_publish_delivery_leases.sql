-- Target-level leases. Only the trusted worker can claim jobs or set delivery evidence.
ALTER TYPE public.post_status ADD VALUE IF NOT EXISTS 'partially_published';
ALTER TYPE public.post_status ADD VALUE IF NOT EXISTS 'needs_attention';
ALTER TABLE public.post_targets
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_container_id text,
  ADD COLUMN IF NOT EXISTS submission_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_publish_targets(_post_id uuid DEFAULT NULL, _limit integer DEFAULT 10)
RETURNS SETOF public.post_targets LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- A timed-out submission may have succeeded remotely. Do not submit it again.
  UPDATE public.post_targets t SET status = 'failed',
    error = 'Delivery outcome uncertain. Check the account feed before retrying.',
    lease_token = NULL, lease_expires_at = NULL, next_retry_at = NULL
  FROM public.posts p WHERE t.post_id = p.id AND (_post_id IS NULL OR p.id = _post_id)
    AND t.status = 'publishing' AND t.lease_expires_at < now()
    AND t.submission_started_at IS NOT NULL;

  UPDATE public.posts p SET status = CASE WHEN EXISTS (
    SELECT 1 FROM public.post_targets t WHERE t.post_id = p.id AND t.status = 'published'
  ) THEN 'partially_published'::public.post_status ELSE 'needs_attention'::public.post_status END
  WHERE p.status = 'publishing' AND (_post_id IS NULL OR p.id = _post_id)
    AND EXISTS (SELECT 1 FROM public.post_targets t WHERE t.post_id = p.id AND t.status = 'failed')
    AND NOT EXISTS (SELECT 1 FROM public.post_targets t WHERE t.post_id = p.id AND t.status IN ('pending','retrying','publishing'));

  RETURN QUERY WITH candidates AS (
    SELECT t.id FROM public.post_targets t JOIN public.posts p ON p.id = t.post_id
    JOIN public.workspaces w ON w.id = p.workspace_id
    JOIN public.social_accounts a ON a.id = t.social_account_id AND a.workspace_id = p.workspace_id
    WHERE (_post_id IS NULL OR p.id = _post_id)
      AND p.status IN ('scheduled', 'publishing', 'partially_published')
      AND p.scheduled_at <= now()
      AND a.is_enabled AND a.status <> 'disconnected'
      AND t.platform_post_id IS NULL AND t.submission_started_at IS NULL
      AND (NOT w.requires_approval OR p.approved_at IS NOT NULL)
      AND ((t.status = 'pending') OR (t.status = 'retrying' AND t.next_retry_at <= now())
        OR (t.status = 'publishing' AND t.lease_expires_at < now() AND t.submission_started_at IS NULL))
    ORDER BY p.scheduled_at, t.id FOR UPDATE OF t SKIP LOCKED LIMIT greatest(1, least(_limit, 10))
  ) UPDATE public.post_targets t SET status = 'publishing', lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '10 minutes', attempts = t.attempts + 1,
    last_attempt_at = now(), next_retry_at = NULL
  FROM candidates c WHERE t.id = c.id RETURNING t.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_publish_targets(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_targets(uuid, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.validate_publish_target_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.posts p JOIN public.social_accounts a
    ON a.workspace_id = p.workspace_id WHERE p.id = NEW.post_id AND a.id = NEW.social_account_id
    AND a.platform = NEW.platform) THEN
    RAISE EXCEPTION 'Publishing destination must belong to the post workspace';
  END IF;
  IF auth.role() = 'authenticated' THEN
    IF NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL OR NEW.provider_container_id IS NOT NULL
       OR NEW.submission_started_at IS NOT NULL THEN
      RAISE EXCEPTION 'Delivery evidence is managed by the publishing worker';
    END IF;
    IF TG_OP = 'UPDATE' AND (OLD.platform_post_id IS NOT NULL OR OLD.status = 'publishing' OR OLD.submission_started_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Submitted deliveries cannot be overwritten';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_publish_target_workspace BEFORE INSERT OR UPDATE ON public.post_targets
FOR EACH ROW EXECUTE FUNCTION public.validate_publish_target_workspace();

CREATE OR REPLACE FUNCTION public.enforce_publish_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE approval_required boolean;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT public.is_workspace_member(auth.uid(), NEW.workspace_id) THEN RAISE EXCEPTION 'Workspace access required'; END IF;
    IF NEW.approved_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
      IF NOT public.is_workspace_owner(auth.uid(), NEW.workspace_id) AND NOT EXISTS (
        SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = NEW.workspace_id
        AND m.user_id = auth.uid() AND m.role = 'admin'
      ) THEN RAISE EXCEPTION 'Only authorised approvers can approve posts'; END IF;
      IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Approval must identify the current user'; END IF;
    END IF;
    SELECT w.requires_approval INTO approval_required FROM public.workspaces w WHERE w.id = NEW.workspace_id;
    IF TG_OP = 'UPDATE' AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
      OR NEW.first_comment IS DISTINCT FROM OLD.first_comment) THEN
      NEW.approved_at = NULL; NEW.approved_by = NULL;
    END IF;
    IF approval_required AND NEW.status IN ('scheduled','publishing') AND NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'This workspace requires approval before publishing';
    END IF;
    IF NEW.status IN ('publishing','published','partially_published') THEN
      RAISE EXCEPTION 'Delivery status is managed by the publishing worker';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER enforce_publish_approval BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_publish_approval();

CREATE TABLE public.publish_autopilot_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_ids uuid[] NOT NULL DEFAULT '{}',
  source_post_ids uuid[] NOT NULL DEFAULT '{}',
  source_versions jsonb NOT NULL DEFAULT '{}',
  timezone text NOT NULL DEFAULT 'UTC',
  weekdays integer[] NOT NULL DEFAULT '{1,3,5}',
  local_time time NOT NULL DEFAULT '09:00',
  enabled boolean NOT NULL DEFAULT false,
  authorized_by uuid NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.publish_autopilot_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read autopilot plans" ON public.publish_autopilot_plans FOR SELECT TO authenticated
USING (public.is_workspace_member(auth.uid(), workspace_id));
REVOKE ALL ON public.publish_autopilot_plans FROM anon, authenticated;
GRANT SELECT ON public.publish_autopilot_plans TO authenticated;
GRANT ALL ON public.publish_autopilot_plans TO service_role;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS autopilot_plan_id uuid REFERENCES public.publish_autopilot_plans(id);
CREATE TABLE public.publish_autopilot_uses (
  plan_id uuid NOT NULL REFERENCES public.publish_autopilot_plans(id) ON DELETE CASCADE,
  source_post_id uuid NOT NULL REFERENCES public.posts(id),
  account_id uuid NOT NULL REFERENCES public.social_accounts(id),
  generated_post_id uuid NOT NULL REFERENCES public.posts(id),
  scheduled_at timestamptz NOT NULL,
  PRIMARY KEY (plan_id, source_post_id, account_id),
  UNIQUE (plan_id, account_id, scheduled_at)
);
ALTER TABLE public.publish_autopilot_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publish_autopilot_uses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.publish_autopilot_uses TO service_role;

CREATE OR REPLACE FUNCTION public.configure_publish_autopilot(
  _workspace_id uuid, _account_ids uuid[], _source_post_ids uuid[], _timezone text,
  _weekdays integer[], _local_time text, _enabled boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE plan_id uuid; account_id uuid; source_id uuid; snapshots jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_workspace_member(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'Workspace access required'; END IF;
  IF _enabled AND EXISTS (SELECT 1 FROM public.workspaces WHERE id = _workspace_id AND requires_approval) THEN
    RAISE EXCEPTION 'This workspace requires approval for each post'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = _timezone) THEN RAISE EXCEPTION 'Invalid timezone'; END IF;
  IF _weekdays IS NULL OR cardinality(_weekdays) = 0 OR NOT _weekdays <@ ARRAY[0,1,2,3,4,5,6] THEN
    RAISE EXCEPTION 'Choose valid posting weekdays'; END IF;
  IF _enabled AND (coalesce(cardinality(_account_ids),0) = 0 OR coalesce(cardinality(_source_post_ids),0) = 0) THEN
    RAISE EXCEPTION 'Select destinations and approved assets'; END IF;
  FOREACH account_id IN ARRAY _account_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.social_accounts WHERE id = account_id AND workspace_id = _workspace_id
      AND platform IN ('facebook','instagram')) THEN RAISE EXCEPTION 'Invalid publishing destination'; END IF;
  END LOOP;
  FOREACH source_id IN ARRAY _source_post_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = source_id AND workspace_id = _workspace_id AND status = 'draft'
      AND autopilot_plan_id IS NULL) THEN RAISE EXCEPTION 'Select draft assets approved for autopilot'; END IF;
  END LOOP;
  SELECT coalesce(jsonb_object_agg(p.id::text, md5((to_jsonb(p)-'updated_at')::text || coalesce((
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.position,m.id)::text FROM public.post_media m WHERE m.post_id = p.id
  ),'[]') || coalesce((SELECT jsonb_agg(jsonb_build_object('account',t.social_account_id,'caption',t.caption_override,'comment',t.first_comment_override) ORDER BY t.id)::text FROM public.post_targets t WHERE t.post_id = p.id),'[]'))),'{}'::jsonb) INTO snapshots FROM public.posts p WHERE p.id = ANY(_source_post_ids);
  INSERT INTO public.publish_autopilot_plans(workspace_id,account_ids,source_post_ids,source_versions,timezone,weekdays,local_time,enabled,authorized_by)
  VALUES (_workspace_id,_account_ids,_source_post_ids,snapshots,_timezone,_weekdays,_local_time::time,_enabled,auth.uid())
  ON CONFLICT (workspace_id) DO UPDATE SET account_ids = excluded.account_ids, source_post_ids = excluded.source_post_ids,
    source_versions = excluded.source_versions,
    timezone = excluded.timezone, weekdays = excluded.weekdays, local_time = excluded.local_time,
    enabled = excluded.enabled, authorized_by = auth.uid(), authorized_at = now(), updated_at = now()
  RETURNING id INTO plan_id;
  -- A renewed plan invalidates previously generated, unclaimed work; already submitted work is immutable.
  UPDATE public.post_targets t SET status = 'skipped', error = 'Autopilot plan paused or changed', next_retry_at = NULL
  FROM public.posts p WHERE p.id = t.post_id AND p.autopilot_plan_id = plan_id AND t.status IN ('pending','retrying');
  UPDATE public.posts SET status = 'draft', scheduled_at = NULL WHERE autopilot_plan_id = plan_id AND status = 'scheduled';
  DELETE FROM public.publish_autopilot_uses u USING public.posts p WHERE u.generated_post_id = p.id
    AND p.autopilot_plan_id = plan_id AND p.status = 'draft' AND NOT EXISTS (
      SELECT 1 FROM public.post_targets t WHERE t.post_id = p.id AND (t.platform_post_id IS NOT NULL OR t.submission_started_at IS NOT NULL));
  RETURN plan_id;
END $$;
REVOKE ALL ON FUNCTION public.configure_publish_autopilot(uuid,uuid[],uuid[],text,integer[],text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_publish_autopilot(uuid,uuid[],uuid[],text,integer[],text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.fill_publish_autopilot_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE plan public.publish_autopilot_plans; source public.posts; destination public.social_accounts;
  day_offset integer; local_day date; slot timestamptz; generated_id uuid; made integer := 0; empty_slots integer := 0;
BEGIN
  FOR plan IN SELECT ap.* FROM public.publish_autopilot_plans ap JOIN public.workspaces w ON w.id = ap.workspace_id
    WHERE ap.enabled AND NOT w.requires_approval FOR UPDATE OF ap SKIP LOCKED LOOP
    FOR day_offset IN 0..6 LOOP
      local_day := (now() AT TIME ZONE plan.timezone)::date + day_offset;
      IF NOT extract(dow FROM local_day)::integer = ANY(plan.weekdays) THEN CONTINUE; END IF;
      slot := (local_day + plan.local_time) AT TIME ZONE plan.timezone;
      IF slot <= now() THEN CONTINUE; END IF;
      FOR destination IN SELECT * FROM public.social_accounts WHERE id = ANY(plan.account_ids) AND workspace_id = plan.workspace_id
        AND platform IN ('facebook','instagram') AND is_enabled AND status <> 'disconnected' LOOP
        IF EXISTS (SELECT 1 FROM public.publish_autopilot_uses WHERE plan_id = plan.id AND account_id = destination.id
          AND scheduled_at = slot) THEN CONTINUE; END IF;
        SELECT p.* INTO source FROM public.posts p WHERE p.id = ANY(plan.source_post_ids) AND p.workspace_id = plan.workspace_id
          AND p.status = 'draft' AND p.autopilot_plan_id IS NULL
          AND plan.source_versions ->> p.id::text = md5((to_jsonb(p)-'updated_at')::text || coalesce((
            SELECT jsonb_agg(to_jsonb(m) ORDER BY m.position,m.id)::text FROM public.post_media m WHERE m.post_id = p.id),'[]') || coalesce((SELECT jsonb_agg(jsonb_build_object('account',t.social_account_id,'caption',t.caption_override,'comment',t.first_comment_override) ORDER BY t.id)::text FROM public.post_targets t WHERE t.post_id = p.id),'[]'))
          AND NOT EXISTS (SELECT 1 FROM public.publish_autopilot_uses u WHERE u.source_post_id = p.id AND u.account_id = destination.id)
          AND (destination.platform <> 'instagram' OR EXISTS (SELECT 1 FROM public.post_media m WHERE m.post_id = p.id))
          ORDER BY p.created_at, p.id LIMIT 1;
        IF NOT FOUND THEN empty_slots := empty_slots + 1; CONTINUE; END IF;
        INSERT INTO public.posts(workspace_id,created_by,status,caption,first_comment,hashtags,scheduled_at,post_type,autopilot_plan_id)
          VALUES (plan.workspace_id,plan.authorized_by,'scheduled',source.caption,source.first_comment,source.hashtags,slot,source.post_type,plan.id)
          RETURNING id INTO generated_id;
        INSERT INTO public.post_media(post_id,kind,storage_path,mime,width,height,duration_ms,position,alt_text,thumb_offset_ms)
          SELECT generated_id,kind,storage_path,mime,width,height,duration_ms,position,alt_text,thumb_offset_ms
          FROM public.post_media WHERE post_id = source.id;
        INSERT INTO public.post_targets(post_id,social_account_id,platform,caption_override,first_comment_override)
          VALUES(generated_id,destination.id,destination.platform,
            (SELECT t.caption_override FROM public.post_targets t WHERE t.post_id = source.id AND t.social_account_id = destination.id),
            (SELECT t.first_comment_override FROM public.post_targets t WHERE t.post_id = source.id AND t.social_account_id = destination.id));
        INSERT INTO public.publish_autopilot_uses VALUES(plan.id,source.id,destination.id,generated_id,slot);
        made := made + 1;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('created',made,'empty_slots',empty_slots);
END $$;
REVOKE ALL ON FUNCTION public.fill_publish_autopilot_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fill_publish_autopilot_queue() TO service_role;

CREATE OR REPLACE FUNCTION public.protect_scheduled_source_media()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.publish_autopilot_uses u JOIN public.posts p ON p.id = u.generated_post_id
    JOIN public.post_media m ON m.post_id = p.id AND m.storage_path = OLD.storage_path
    WHERE u.source_post_id = OLD.post_id AND p.status IN ('scheduled','publishing')) THEN
    RAISE EXCEPTION 'This asset is used by a scheduled autopilot post. Pause its plan before changing the source.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_scheduled_source_media() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_scheduled_source_media BEFORE UPDATE OR DELETE ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.protect_scheduled_source_media();

CREATE OR REPLACE FUNCTION public.invalidate_publish_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE parent_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN parent_id := OLD.post_id; ELSE parent_id := NEW.post_id; END IF;
  IF auth.role() = 'authenticated' THEN
    UPDATE public.posts p SET approved_at = NULL, approved_by = NULL, status = 'draft'
    FROM public.workspaces w WHERE p.id = parent_id AND w.id = p.workspace_id AND w.requires_approval
      AND p.status NOT IN ('publishing','published','partially_published');
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER invalidate_target_approval AFTER INSERT OR UPDATE OR DELETE ON public.post_targets
FOR EACH ROW EXECUTE FUNCTION public.invalidate_publish_approval();
CREATE TRIGGER invalidate_media_approval AFTER INSERT OR UPDATE OR DELETE ON public.post_media
FOR EACH ROW EXECUTE FUNCTION public.invalidate_publish_approval();
