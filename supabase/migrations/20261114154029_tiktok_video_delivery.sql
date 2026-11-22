-- Choices are per destination: different TikTok accounts can have different
-- permitted privacy and interaction settings. Delivery validates these again.
ALTER TABLE public.post_targets ADD COLUMN IF NOT EXISTS tiktok_options jsonb;
ALTER TABLE public.post_targets ADD CONSTRAINT post_targets_tiktok_options_check
  CHECK (tiktok_options IS NULL OR (platform = 'tiktok' AND jsonb_typeof(tiktok_options) = 'object' AND pg_column_size(tiktok_options) <= 4096));

-- The media capability encryption key is server-only and shared by the
-- existing publishing worker and verified-domain streaming endpoint.
INSERT INTO public.internal_job_secrets(name, secret)
VALUES ('tiktok_media', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- A refresh can rotate a one-use credential. Keep an uncertain refresh locked
-- until a successful reconnect, and serialize reconnect with the account row.
CREATE TABLE public.tiktok_refresh_locks (
  social_account_id uuid PRIMARY KEY REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  lock_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tiktok_refresh_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tiktok_refresh_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tiktok_refresh_locks TO service_role;

CREATE FUNCTION public.claim_tiktok_refresh(_account_id uuid, _workspace_id uuid, _refresh_token text, _lock_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.social_accounts WHERE id = _account_id AND workspace_id = _workspace_id AND platform = 'tiktok' AND refresh_token = _refresh_token AND status <> 'disconnected' AND is_enabled IS NOT false FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.tiktok_refresh_locks(social_account_id, lock_id) VALUES (_account_id, _lock_id) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

CREATE FUNCTION public.complete_tiktok_refresh(_account_id uuid, _workspace_id uuid, _old_refresh text, _lock_id uuid, _access text, _refresh text, _expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM public.social_accounts WHERE id = _account_id AND workspace_id = _workspace_id AND platform = 'tiktok' AND refresh_token = _old_refresh AND status <> 'disconnected' AND is_enabled IS NOT false FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tiktok_refresh_locks WHERE social_account_id = _account_id AND lock_id = _lock_id) THEN RETURN false; END IF;
  UPDATE public.social_accounts SET access_token = _access, refresh_token = _refresh, expires_at = _expires_at, token_encrypted_at = now() WHERE id = _account_id;
  DELETE FROM public.tiktok_refresh_locks WHERE social_account_id = _account_id AND lock_id = _lock_id;
  RETURN true;
END $$;

CREATE FUNCTION public.save_tiktok_oauth_account(_account jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE account_id uuid;
BEGIN
  INSERT INTO public.social_accounts (workspace_id, platform, external_id, handle, display_name, avatar_url,
    access_token, refresh_token, scopes, expires_at, token_encrypted_at, status, is_enabled, last_error, connected_by, metadata)
  VALUES ((_account->>'workspace_id')::uuid, 'tiktok', _account->>'external_id', _account->>'handle', _account->>'display_name', _account->>'avatar_url',
    _account->>'access_token', _account->>'refresh_token', ARRAY(SELECT jsonb_array_elements_text(_account->'scopes')),
    (_account->>'expires_at')::timestamptz, now(), 'connected', true, NULL, (_account->>'connected_by')::uuid, coalesce(_account->'metadata', '{}'::jsonb))
  ON CONFLICT (workspace_id, platform, external_id) DO UPDATE SET
    handle=EXCLUDED.handle, display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url,
    access_token=EXCLUDED.access_token, refresh_token=EXCLUDED.refresh_token, scopes=EXCLUDED.scopes,
    expires_at=EXCLUDED.expires_at, token_encrypted_at=EXCLUDED.token_encrypted_at, status='connected',
    is_enabled=true, last_error=NULL, connected_by=EXCLUDED.connected_by, metadata=EXCLUDED.metadata
  RETURNING id INTO account_id;
  DELETE FROM public.tiktok_refresh_locks WHERE social_account_id = account_id;
END $$;
REVOKE ALL ON FUNCTION public.claim_tiktok_refresh(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_tiktok_refresh(uuid, uuid, text, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_tiktok_oauth_account(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_tiktok_refresh(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_tiktok_refresh(uuid, uuid, text, uuid, text, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_publish_targets(_post_id uuid DEFAULT NULL, _limit integer DEFAULT 10)
RETURNS SETOF public.post_targets LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  -- Submission with no persisted provider ID is ambiguous and must never be retried.
  UPDATE public.post_targets t SET status = 'failed',
    error = 'Delivery outcome uncertain. Check the account feed before retrying.',
    lease_token = NULL, lease_expires_at = NULL, next_retry_at = NULL
  FROM public.posts p WHERE t.post_id = p.id AND (_post_id IS NULL OR p.id = _post_id)
    AND t.status = 'publishing' AND t.lease_expires_at < now()
    AND t.submission_started_at IS NOT NULL
    AND NOT (t.platform = 'tiktok' AND t.provider_container_id IS NOT NULL);

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
      AND t.platform_post_id IS NULL
      AND (t.submission_started_at IS NULL OR (t.platform = 'tiktok' AND t.provider_container_id IS NOT NULL))
      AND (NOT w.requires_approval OR p.approved_at IS NOT NULL)
      AND ((t.status = 'pending' AND t.submission_started_at IS NULL)
        OR (t.status = 'retrying' AND t.next_retry_at <= now())
        OR (t.status = 'publishing' AND t.lease_expires_at < now()))
    ORDER BY p.scheduled_at, t.id FOR UPDATE OF t, p SKIP LOCKED LIMIT greatest(1, least(_limit, 10))
  ) UPDATE public.post_targets t SET status = 'publishing', lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '10 minutes',
    attempts = CASE WHEN t.platform = 'tiktok' AND t.submission_started_at IS NOT NULL AND t.provider_container_id IS NOT NULL THEN t.attempts ELSE t.attempts + 1 END,
    last_attempt_at = now(), next_retry_at = NULL
  FROM candidates c WHERE t.id = c.id RETURNING t.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_publish_targets(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_targets(uuid, integer) TO service_role;
