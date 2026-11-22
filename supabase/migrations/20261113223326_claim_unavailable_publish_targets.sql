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
      -- Claim disconnected accounts so the worker records a failure instead of leaving them pending.
      AND t.platform_post_id IS NULL AND t.submission_started_at IS NULL
      AND (NOT w.requires_approval OR p.approved_at IS NOT NULL)
      AND ((t.status = 'pending') OR (t.status = 'retrying' AND t.next_retry_at <= now())
        OR (t.status = 'publishing' AND t.lease_expires_at < now() AND t.submission_started_at IS NULL))
    ORDER BY p.scheduled_at, t.id FOR UPDATE OF t, p SKIP LOCKED LIMIT greatest(1, least(_limit, 10))
  ) UPDATE public.post_targets t SET status = 'publishing', lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '10 minutes', attempts = t.attempts + 1,
    last_attempt_at = now(), next_retry_at = NULL
  FROM candidates c WHERE t.id = c.id RETURNING t.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_publish_targets(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publish_targets(uuid, integer) TO service_role;



