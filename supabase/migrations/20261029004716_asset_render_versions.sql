-- Preserve each rendered brief and allow an explicit primary video version.
ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS brief_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS revision_note text;

ALTER TABLE public.creative_variants
  ADD COLUMN IF NOT EXISTS primary_render_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_variants_primary_render_id_fkey' AND conrelid = 'public.creative_variants'::regclass) THEN
    ALTER TABLE public.creative_variants
      ADD CONSTRAINT creative_variants_primary_render_id_fkey
      FOREIGN KEY (primary_render_id) REFERENCES public.render_jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

-- A request racing another request cannot queue a second edit of the same asset.
CREATE UNIQUE INDEX IF NOT EXISTS render_jobs_one_active_version
  ON public.render_jobs (variant_id)
  WHERE status IN ('queued', 'preparing', 'rendering');

-- Only the matching current brief is reconstructable for pre-migration renders.
-- Older videos remain viewable/selectable without inventing their historical inputs.
UPDATE public.render_jobs j
SET brief_snapshot = jsonb_build_object(
  'hook', v.hook, 'angle', v.angle, 'narrative', v.narrative, 'argument', v.argument,
  'format', v.format, 'beats', v.beats, 'voiceover', v.voiceover, 'script', v.script,
  'caption', v.caption, 'cta', v.cta, 'duration_s', v.duration_s, 'size', v.size,
  'voice_id', v.voice_id, 'file_ids', v.file_ids, 'captions', v.captions,
  'composition_html', coalesce(j.composition_html, v.composition_html),
  'build_prompt', v.build_prompt, 'build_report', v.build_report, 'design_mode', v.design_mode,
  'opening_visual', v.opening_visual, 'review_state', v.review_state,
  'review_note', v.review_note, 'version', v.version
)
FROM public.creative_variants v
WHERE j.variant_id = v.id AND j.version = v.version AND j.brief_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.validate_asset_primary_render()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.primary_render_id IS NOT NULL AND OLD.primary_render_id IS DISTINCT FROM NEW.primary_render_id AND EXISTS (
      SELECT 1 FROM public.render_jobs j WHERE j.variant_id = NEW.id AND j.status IN ('queued', 'preparing', 'rendering')
    ) THEN
      RAISE EXCEPTION 'Wait for the current edit to finish before changing the primary version';
    END IF;
  END IF;
  IF NEW.primary_render_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.render_jobs j
    WHERE j.id = NEW.primary_render_id AND j.variant_id = NEW.id
      AND j.workspace_id = NEW.workspace_id AND j.status = 'done' AND j.storage_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The primary version must be a finished render of this asset';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_asset_primary_render ON public.creative_variants;
CREATE TRIGGER validate_asset_primary_render
  BEFORE INSERT OR UPDATE OF primary_render_id ON public.creative_variants
  FOR EACH ROW EXECUTE FUNCTION public.validate_asset_primary_render();

UPDATE public.creative_variants v
SET primary_render_id = (
  SELECT j.id FROM public.render_jobs j
  WHERE j.variant_id = v.id AND j.workspace_id = v.workspace_id
    AND j.status = 'done' AND j.storage_path IS NOT NULL
  ORDER BY j.created_at DESC, j.id DESC LIMIT 1
)
WHERE v.primary_render_id IS NULL;

-- The first render becomes primary. Later revisions stay candidates until chosen.
CREATE OR REPLACE FUNCTION public.choose_first_asset_render()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'done' AND NEW.storage_path IS NOT NULL THEN
    UPDATE public.creative_variants
    SET primary_render_id = NEW.id
    WHERE id = NEW.variant_id AND workspace_id = NEW.workspace_id AND primary_render_id IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS choose_first_asset_render ON public.render_jobs;
CREATE TRIGGER choose_first_asset_render
  AFTER INSERT OR UPDATE OF status, storage_path ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.choose_first_asset_render();

-- Trigger functions are not public RPCs; invocation remains through their tables.
REVOKE ALL ON FUNCTION public.validate_asset_primary_render() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.choose_first_asset_render() FROM PUBLIC, anon, authenticated;

-- These helpers are service-only RPCs. They keep version/queue/review changes atomic.
CREATE OR REPLACE FUNCTION public.asset_brief_snapshot(_asset public.creative_variants)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'hook', (_asset).hook, 'angle', (_asset).angle, 'narrative', (_asset).narrative, 'argument', (_asset).argument,
    'format', (_asset).format, 'beats', (_asset).beats, 'voiceover', (_asset).voiceover, 'script', (_asset).script,
    'caption', (_asset).caption, 'cta', (_asset).cta, 'duration_s', (_asset).duration_s, 'size', (_asset).size,
    'voice_id', (_asset).voice_id, 'file_ids', (_asset).file_ids, 'captions', (_asset).captions,
    'composition_html', (_asset).composition_html, 'build_prompt', (_asset).build_prompt,
    'build_report', (_asset).build_report, 'design_mode', (_asset).design_mode,
    'opening_visual', (_asset).opening_visual, 'review_state', (_asset).review_state,
    'review_note', (_asset).review_note, 'version', (_asset).version
  );
$$;

CREATE OR REPLACE FUNCTION public.enqueue_asset_revision(
  _variant_id uuid, _expected_version integer, _brief jsonb, _revision_note text, _user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v public.creative_variants%ROWTYPE;
  revised public.creative_variants%ROWTYPE;
  next_version integer;
  clip_limit integer;
  used_clips integer;
  queued_id uuid;
  frozen jsonb;
BEGIN
  SELECT * INTO v FROM public.creative_variants WHERE id = _variant_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.can_access_workspace(_user_id, v.workspace_id), false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v.version <> _expected_version THEN RAISE EXCEPTION 'This asset changed while Sam was editing it. Refresh and try again.'; END IF;
  IF EXISTS (SELECT 1 FROM public.render_jobs WHERE variant_id = v.id AND status IN ('queued', 'preparing', 'rendering')) THEN
    RAISE EXCEPTION 'Sam is already editing this asset. Wait for the current version to finish.';
  END IF;
  IF _brief IS NULL OR jsonb_typeof(_brief) <> 'object' OR length(coalesce(_revision_note, '')) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Invalid revision'; END IF;
  revised := jsonb_populate_record(v, _brief);
  IF length(trim(coalesce(revised.voiceover, ''))) = 0 THEN RAISE EXCEPTION 'Add a voiceover script first.'; END IF;
  IF revised.duration_s <= 0 OR revised.duration_s > 120 THEN RAISE EXCEPTION 'Invalid video duration'; END IF;
  -- Serialize allowance checks across revisions in the same workspace.
  PERFORM 1 FROM public.workspaces WHERE id = v.workspace_id FOR UPDATE;
  SELECT coalesce(monthly_clip_limit, 12) INTO clip_limit FROM public.generation_allowances WHERE workspace_id = v.workspace_id;
  clip_limit := coalesce(clip_limit, 12);
  SELECT count(*) INTO used_clips FROM public.render_jobs
  WHERE workspace_id = v.workspace_id AND status <> 'failed' AND created_at >= date_trunc('month', now());
  IF used_clips >= clip_limit THEN RAISE EXCEPTION 'This month''s video allowance is used up. A workspace owner can raise it.'; END IF;
  SELECT greatest(v.version, coalesce(max(version), 0)) + 1 INTO next_version FROM public.render_jobs WHERE variant_id = v.id;
  UPDATE public.creative_variants SET
    hook = revised.hook, angle = revised.angle, narrative = revised.narrative, argument = revised.argument,
    format = revised.format, beats = revised.beats, voiceover = revised.voiceover, script = revised.script,
    caption = revised.caption, cta = revised.cta, duration_s = revised.duration_s, size = revised.size,
    voice_id = revised.voice_id, file_ids = revised.file_ids, captions = revised.captions,
    composition_html = revised.composition_html, build_prompt = revised.build_prompt,
    build_report = revised.build_report, design_mode = revised.design_mode, opening_visual = revised.opening_visual,
    version = next_version, review_state = CASE WHEN v.primary_render_id IS NULL THEN 'needs_revision' ELSE v.review_state END,
    review_note = CASE WHEN v.primary_render_id IS NULL THEN _revision_note ELSE v.review_note END
  WHERE id = v.id;
  frozen := public.asset_brief_snapshot(revised) || jsonb_build_object('version', next_version, 'review_state', 'draft', 'review_note', _revision_note);
  INSERT INTO public.render_jobs (workspace_id, variant_id, status, model, version, created_by, brief_snapshot, revision_note)
  VALUES (v.workspace_id, v.id, 'queued', 'autotoast-hyperframes', next_version, _user_id, frozen, _revision_note)
  RETURNING id INTO queued_id;
  RETURN jsonb_build_object('render_id', queued_id, 'version', next_version);
END $$;

CREATE OR REPLACE FUNCTION public.review_asset_render(
  _variant_id uuid, _render_id uuid, _state text, _note text, _user_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v public.creative_variants%ROWTYPE;
  j public.render_jobs%ROWTYPE;
  chosen_id uuid;
  frozen jsonb;
BEGIN
  SELECT * INTO v FROM public.creative_variants WHERE id = _variant_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.can_access_workspace(_user_id, v.workspace_id), false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _state NOT IN ('approved', 'needs_revision', 'rejected', 'draft') OR length(coalesce(_note, '')) > 1000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
  chosen_id := coalesce(_render_id, v.primary_render_id);
  IF chosen_id IS NULL THEN
    SELECT id INTO chosen_id FROM public.render_jobs WHERE variant_id = v.id AND status = 'done' AND storage_path IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1;
  END IF;
  IF chosen_id IS NOT NULL THEN
    SELECT * INTO j FROM public.render_jobs WHERE id = chosen_id AND variant_id = v.id AND workspace_id = v.workspace_id AND status = 'done' AND storage_path IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a finished version to review.'; END IF;
  ELSIF _state = 'approved' THEN RAISE EXCEPTION 'Render the video before approving it.';
  END IF;
  IF _state = 'approved' AND EXISTS (SELECT 1 FROM public.render_jobs WHERE variant_id = v.id AND status IN ('queued', 'preparing', 'rendering')) THEN
    RAISE EXCEPTION 'Wait for the current edit to finish before approving a version.';
  END IF;
  IF j.id IS NOT NULL THEN
    frozen := coalesce(j.brief_snapshot, CASE WHEN j.version = v.version THEN public.asset_brief_snapshot(v) ELSE '{}'::jsonb END)
      || jsonb_build_object('review_state', _state, 'review_note', _note);
    UPDATE public.render_jobs SET brief_snapshot = frozen WHERE id = j.id;
  END IF;
  IF _state = 'approved' OR v.primary_render_id IS NULL OR j.id = v.primary_render_id THEN
    UPDATE public.creative_variants SET review_state = _state, review_note = _note,
      primary_render_id = CASE WHEN _state = 'approved' THEN j.id ELSE primary_render_id END
    WHERE id = v.id;
  END IF;
  RETURN jsonb_build_object('render_id', j.id);
END $$;

CREATE OR REPLACE FUNCTION public.set_primary_asset_render(_variant_id uuid, _render_id uuid, _user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v public.creative_variants%ROWTYPE;
  j public.render_jobs%ROWTYPE;
  frozen jsonb;
  state text;
BEGIN
  SELECT * INTO v FROM public.creative_variants WHERE id = _variant_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.can_access_workspace(_user_id, v.workspace_id), false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.render_jobs WHERE variant_id = v.id AND status IN ('queued', 'preparing', 'rendering')) THEN
    RAISE EXCEPTION 'Wait for Sam to finish the current edit before changing the primary version.';
  END IF;
  SELECT * INTO j FROM public.render_jobs WHERE id = _render_id AND variant_id = v.id AND workspace_id = v.workspace_id AND status = 'done' AND storage_path IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a finished version.'; END IF;
  frozen := coalesce(j.brief_snapshot, CASE WHEN j.version = v.version THEN public.asset_brief_snapshot(v) ELSE '{}'::jsonb END);
  state := CASE WHEN frozen->>'review_state' IN ('approved', 'needs_revision', 'rejected', 'draft') THEN frozen->>'review_state' ELSE 'draft' END;
  UPDATE public.creative_variants SET primary_render_id = j.id, review_state = state, review_note = frozen->>'review_note' WHERE id = v.id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.asset_brief_snapshot(public.creative_variants) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_asset_revision(uuid, integer, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_asset_render(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_primary_asset_render(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asset_brief_snapshot(public.creative_variants) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_asset_revision(uuid, integer, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_asset_render(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_primary_asset_render(uuid, uuid, uuid) TO service_role;
