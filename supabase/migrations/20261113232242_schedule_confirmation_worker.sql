-- Keep this worker inactive until the matching production endpoint is live.
INSERT INTO public.internal_job_secrets(name, secret)
VALUES ('schedule_confirmations', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

CREATE FUNCTION public.advance_schedule_confirmations() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job_secret text; worker_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schedule_confirmation_outbox WHERE status IN ('ready_to_assemble','pending','sending')) THEN RETURN; END IF;
  SELECT secret INTO job_secret FROM public.internal_job_secrets WHERE name = 'schedule_confirmations';
  IF job_secret IS NULL THEN RAISE EXCEPTION 'Schedule confirmation worker authentication is unavailable'; END IF;
  SELECT NULLIF(btrim(decrypted_secret), '') INTO worker_url
  FROM vault.decrypted_secrets WHERE name = 'schedule_confirmations_url';
  IF worker_url IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := worker_url,
    body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-schedule-confirmation-secret',job_secret),
    timeout_milliseconds := 300000);
END $$;
REVOKE ALL ON FUNCTION public.advance_schedule_confirmations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_schedule_confirmations() TO service_role;

DO $$
DECLARE job_id bigint;
BEGIN
  SELECT cron.schedule('autosocials-schedule-confirmations', '* * * * *', 'select public.advance_schedule_confirmations();') INTO job_id;
  PERFORM cron.alter_job(job_id, active := false);
END $$;
