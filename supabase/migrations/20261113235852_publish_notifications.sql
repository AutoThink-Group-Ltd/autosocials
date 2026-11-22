-- Publishing-success notifications are opt-in and scoped to an active workspace member.
CREATE TABLE public.publish_notification_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.publish_notification_recipients (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  selected boolean NOT NULL DEFAULT false,
  opted_in boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE TABLE public.publish_notification_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  subject_user_id uuid,
  actor_id uuid,
  kind text NOT NULL,
  old_value jsonb,
  new_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.publish_notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL UNIQUE REFERENCES public.post_targets(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','assembled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.publish_notification_deliveries (
  event_id uuid NOT NULL REFERENCES public.publish_notification_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','uncertain','suppressed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  error text,
  provider_message_id text,
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX publish_notification_events_pending_idx ON public.publish_notification_events(created_at) WHERE status = 'pending';
CREATE INDEX publish_notification_deliveries_pending_idx ON public.publish_notification_deliveries(next_attempt_at) WHERE status = 'pending';

ALTER TABLE public.publish_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_notification_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_notification_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publish_notification_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publish_notification_settings, public.publish_notification_recipients, public.publish_notification_audit, public.publish_notification_events, public.publish_notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.publish_notification_settings, public.publish_notification_recipients, public.publish_notification_events, public.publish_notification_deliveries TO service_role;
GRANT SELECT, INSERT ON public.publish_notification_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.publish_notification_audit_id_seq TO service_role;

-- The target transition and event insertion share one transaction, including retries.
CREATE FUNCTION public.record_publish_notification_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.publish_notification_events(target_id, workspace_id, post_id)
    SELECT NEW.id, p.workspace_id, p.id FROM public.posts p WHERE p.id = NEW.post_id
    ON CONFLICT (target_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.record_publish_notification_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER publish_notification_event AFTER UPDATE OF status ON public.post_targets
FOR EACH ROW EXECUTE FUNCTION public.record_publish_notification_event();

-- All writes go through a server-authorised service call; updating one field never resets the other.
CREATE FUNCTION public.set_publish_notification_setting(_workspace_id uuid, _actor_id uuid, _action text, _user_id uuid, _value boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous jsonb; current_value jsonb;
BEGIN
  IF _action = 'master' THEN
    SELECT jsonb_build_object('enabled', enabled) INTO previous FROM public.publish_notification_settings WHERE workspace_id = _workspace_id;
    INSERT INTO public.publish_notification_settings(workspace_id,enabled,updated_by) VALUES (_workspace_id,_value,_actor_id)
    ON CONFLICT (workspace_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
    current_value := jsonb_build_object('enabled',_value);
  ELSIF _action IN ('selection','self') THEN
    IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id) THEN
      RAISE EXCEPTION 'Recipient is not an active member';
    END IF;
    SELECT jsonb_build_object('selected', selected, 'opted_in', opted_in) INTO previous FROM public.publish_notification_recipients WHERE workspace_id = _workspace_id AND user_id = _user_id;
    IF _action = 'selection' THEN
      INSERT INTO public.publish_notification_recipients(workspace_id,user_id,selected,updated_by) VALUES (_workspace_id,_user_id,_value,_actor_id)
      ON CONFLICT (workspace_id,user_id) DO UPDATE SET selected = EXCLUDED.selected, updated_by = EXCLUDED.updated_by, updated_at = now();
    ELSE
      INSERT INTO public.publish_notification_recipients(workspace_id,user_id,selected,opted_in,updated_by) VALUES (_workspace_id,_user_id,true,_value,_actor_id)
      ON CONFLICT (workspace_id,user_id) DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_by = EXCLUDED.updated_by, updated_at = now();
    END IF;
    SELECT jsonb_build_object('selected', selected, 'opted_in', opted_in) INTO current_value FROM public.publish_notification_recipients WHERE workspace_id = _workspace_id AND user_id = _user_id;
  ELSE RAISE EXCEPTION 'Invalid setting';
  END IF;
  INSERT INTO public.publish_notification_audit(workspace_id,subject_user_id,actor_id,kind,old_value,new_value)
  VALUES (_workspace_id,CASE WHEN _action = 'master' THEN NULL ELSE _user_id END,_actor_id,_action,previous,current_value);
END $$;
REVOKE ALL ON FUNCTION public.set_publish_notification_setting(uuid,uuid,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_publish_notification_setting(uuid,uuid,text,uuid,boolean) TO service_role;

CREATE FUNCTION public.claim_publish_notification_delivery(_event_id uuid, _user_id uuid)
RETURNS SETOF public.publish_notification_deliveries LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  UPDATE public.publish_notification_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = now()
  WHERE event_id = _event_id AND user_id = _user_id AND status = 'pending' AND next_attempt_at <= now()
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_publish_notification_delivery(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_notification_delivery(uuid,uuid) TO service_role;

INSERT INTO public.internal_job_secrets(name,secret) VALUES ('publish_notifications', encode(extensions.gen_random_bytes(32),'hex')) ON CONFLICT (name) DO NOTHING;
CREATE FUNCTION public.advance_publish_notifications() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job_secret text; worker_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.publish_notification_events WHERE status = 'pending') AND
     NOT EXISTS (SELECT 1 FROM public.publish_notification_deliveries WHERE status IN ('pending','sending')) THEN RETURN; END IF;
  SELECT secret INTO job_secret FROM public.internal_job_secrets WHERE name = 'publish_notifications';
  IF job_secret IS NULL THEN RAISE EXCEPTION 'Notification worker authentication is unavailable'; END IF;
  SELECT NULLIF(btrim(decrypted_secret), '') INTO worker_url
  FROM vault.decrypted_secrets WHERE name = 'publish_notifications_url';
  IF worker_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := worker_url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','x-publish-notification-secret',job_secret), timeout_milliseconds := 300000);
END $$;
REVOKE ALL ON FUNCTION public.advance_publish_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_publish_notifications() TO service_role;
DO $$ DECLARE job_id bigint; BEGIN
  SELECT cron.schedule('autosocials-publish-notifications', '* * * * *', 'select public.advance_publish_notifications();') INTO job_id;
  PERFORM cron.alter_job(job_id, active := false);
END $$;
