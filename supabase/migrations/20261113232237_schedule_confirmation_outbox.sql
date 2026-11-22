-- Service-only outbox; never retry an ambiguous provider submission automatically.
ALTER TABLE public.creation_schedule_requests ADD COLUMN expected_count integer CHECK (expected_count BETWEEN 1 AND 20);
CREATE FUNCTION public.set_schedule_confirmation_expected(_request_id uuid, _workspace_id uuid, _user_id uuid, _count integer)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF _count NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid schedule count'; END IF;
  UPDATE public.creation_schedule_requests SET expected_count = _count
  WHERE request_id = _request_id AND workspace_id = _workspace_id AND user_id = _user_id
    AND (expected_count IS NULL OR expected_count = _count);
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule request or count mismatch'; END IF;
  UPDATE public.schedule_confirmation_outbox o SET status = 'ready_to_assemble', updated_at = now()
  WHERE o.request_id = _request_id AND o.status = 'assembling'
    AND _count = (SELECT count(*) FROM public.creation_schedule_receipts c WHERE c.request_id = _request_id);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.set_schedule_confirmation_expected(uuid,uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_schedule_confirmation_expected(uuid,uuid,uuid,integer) TO service_role;
CREATE TABLE public.schedule_confirmation_outbox (
  request_id uuid PRIMARY KEY REFERENCES public.creation_schedule_requests(request_id),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  user_id uuid NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'assembling' CHECK (status IN ('assembling','ready_to_assemble','pending','sending','sent','failed','uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  error text
);
ALTER TABLE public.schedule_confirmation_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_confirmation_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.schedule_confirmation_outbox TO service_role;
CREATE TABLE public.schedule_confirmation_items (
  request_id uuid NOT NULL,
  post_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  PRIMARY KEY (request_id, post_id),
  FOREIGN KEY (request_id, post_id) REFERENCES public.creation_schedule_receipts(request_id, post_id)
);
ALTER TABLE public.schedule_confirmation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schedule_confirmation_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.schedule_confirmation_items TO service_role;
CREATE FUNCTION public.claim_schedule_confirmation(_request_id uuid)
RETURNS SETOF public.schedule_confirmation_outbox LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.schedule_confirmation_outbox SET status = 'sending', attempts = attempts + 1, updated_at = now()
  WHERE request_id = _request_id AND status = 'pending' AND next_attempt_at <= now() RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_schedule_confirmation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_schedule_confirmation(uuid) TO service_role;

-- Receipt and marker commit together, including when the application process dies.
CREATE FUNCTION public.mark_schedule_confirmation_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Capture accepted content and destinations inside the receipt transaction.
  INSERT INTO public.schedule_confirmation_items(request_id, post_id, snapshot)
  SELECT NEW.request_id, NEW.post_id, jsonb_build_object(
    'title', COALESCE(b.name, v.hook, 'Scheduled post'),
    'scheduledAt', p.scheduled_at,
    'immediate', NEW.immediate_at IS NOT NULL,
    'channels', COALESCE((SELECT jsonb_agg(DISTINCT t.platform) FROM public.post_targets t WHERE t.post_id = p.id), '[]'::jsonb),
    'mediaKind', COALESCE((SELECT m.kind FROM public.post_media m WHERE m.post_id = p.id ORDER BY m.position LIMIT 1), 'image'),
    'mediaPath', (SELECT m.storage_path FROM public.post_media m WHERE m.post_id = p.id AND m.kind = 'image' AND m.mime = 'image/jpeg' ORDER BY m.position LIMIT 1)
  ) FROM public.posts p
  LEFT JOIN public.brand_files b ON p.created_via = 'social_tile:' || b.id::text AND b.workspace_id = p.workspace_id
  LEFT JOIN public.creative_variants v ON v.id = p.variant_id AND v.workspace_id = p.workspace_id
  WHERE p.id = NEW.post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Could not snapshot scheduled post'; END IF;
  INSERT INTO public.schedule_confirmation_outbox(request_id, workspace_id, user_id, payload, status)
    SELECT r.request_id, r.workspace_id, r.user_id, '{}'::jsonb, 'assembling'
    FROM public.creation_schedule_requests r WHERE r.request_id = NEW.request_id
    ON CONFLICT (request_id) DO UPDATE SET updated_at = now()
      WHERE public.schedule_confirmation_outbox.status = 'assembling';
  UPDATE public.schedule_confirmation_outbox o SET status = 'ready_to_assemble', updated_at = now()
  FROM public.creation_schedule_requests r
  WHERE o.request_id = NEW.request_id AND r.request_id = o.request_id AND o.status = 'assembling'
    AND r.expected_count IS NOT NULL AND r.expected_count = (SELECT count(*) FROM public.creation_schedule_receipts c WHERE c.request_id = o.request_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.mark_schedule_confirmation_receipt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_schedule_confirmation_receipt() TO service_role;
CREATE TRIGGER schedule_confirmation_receipt AFTER INSERT ON public.creation_schedule_receipts
FOR EACH ROW EXECUTE FUNCTION public.mark_schedule_confirmation_receipt();

-- Once a partial batch is finalized, new receipts must use a new request. This
-- prevents a concurrent retry from adding posts after its confirmation was sent.
CREATE FUNCTION public.guard_schedule_confirmation_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_status text;
BEGIN
  SELECT status INTO current_status FROM public.schedule_confirmation_outbox WHERE request_id = NEW.request_id FOR UPDATE;
  IF FOUND AND current_status <> 'assembling' THEN
    RAISE EXCEPTION 'This schedule was finalized; prepare remaining posts as a new request';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_schedule_confirmation_receipt() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_schedule_confirmation_receipt() TO service_role;
CREATE TRIGGER guard_schedule_confirmation_receipt BEFORE INSERT ON public.creation_schedule_receipts
FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_confirmation_receipt();

CREATE FUNCTION public.mark_schedule_confirmation_ready(_request_id uuid, _workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Match the receipt RPC's lock order so no new receipt can pass finalization.
  PERFORM 1 FROM public.creation_schedule_requests
    WHERE request_id = _request_id AND workspace_id = _workspace_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule request unavailable'; END IF;
  UPDATE public.schedule_confirmation_outbox SET status = 'ready_to_assemble', updated_at = now()
    WHERE request_id = _request_id AND workspace_id = _workspace_id AND user_id = _user_id AND status = 'assembling'
      AND EXISTS (SELECT 1 FROM public.creation_schedule_receipts WHERE request_id = _request_id);
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.mark_schedule_confirmation_ready(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_schedule_confirmation_ready(uuid,uuid,uuid) TO service_role;

CREATE FUNCTION public.finalize_schedule_confirmation(_request_id uuid, _workspace_id uuid, _user_id uuid, _payload jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE public.schedule_confirmation_outbox SET payload = _payload, status = 'pending', updated_at = now()
  WHERE request_id = _request_id AND workspace_id = _workspace_id AND user_id = _user_id AND status = 'ready_to_assemble';
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.finalize_schedule_confirmation(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_schedule_confirmation(uuid,uuid,uuid,jsonb) TO service_role;
