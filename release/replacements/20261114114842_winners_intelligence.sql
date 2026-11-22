-- Provider data is written only by the authenticated server/worker. Workspace
-- members can read it; shortlist and finding changes go through server checks.
CREATE TABLE public.winner_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','youtube')),
  external_id text NOT NULL,
  post_target_id uuid REFERENCES public.post_targets(id) ON DELETE SET NULL,
  caption text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT 'unknown',
  thumbnail_url text,
  permalink text,
  published_at timestamptz NOT NULL,
  measured_at timestamptz NOT NULL DEFAULT now(),
  views bigint CHECK (views >= 0),
  reach bigint CHECK (reach >= 0),
  likes bigint CHECK (likes >= 0),
  comments_count bigint CHECK (comments_count >= 0),
  shares bigint CHECK (shares >= 0),
  comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  comments_status text NOT NULL DEFAULT 'unavailable',
  UNIQUE (account_id, external_id),
  UNIQUE (workspace_id, id)
);
CREATE INDEX winner_posts_workspace_published ON public.winner_posts(workspace_id, published_at DESC, id DESC);

CREATE TABLE public.winner_syncs (
  account_id uuid PRIMARY KEY REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('syncing','ready','partial','error','reconnect','unsupported')),
  message text,
  cursor text,
  lease_token uuid,
  lease_until timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX winner_syncs_workspace ON public.winner_syncs(workspace_id);

CREATE FUNCTION public.claim_winner_sync(_account_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH claimed AS (
    INSERT INTO public.winner_syncs(account_id, workspace_id, status, lease_token, lease_until, last_attempt_at)
    SELECT id, workspace_id, 'syncing', gen_random_uuid(), now() + interval '10 minutes', now()
    FROM public.social_accounts WHERE id = _account_id AND status = 'connected' AND is_enabled
    ON CONFLICT (account_id) DO UPDATE SET status = 'syncing', lease_token = excluded.lease_token,
      lease_until = excluded.lease_until, last_attempt_at = excluded.last_attempt_at
      WHERE public.winner_syncs.lease_until < now()
    RETURNING lease_token
  ) SELECT lease_token FROM claimed;
$$;
CREATE FUNCTION public.next_winner_account() RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT a.id FROM public.social_accounts a LEFT JOIN public.winner_syncs s ON s.account_id = a.id
  WHERE a.status = 'connected' AND a.is_enabled AND a.platform IN ('facebook','instagram','tiktok','youtube')
    AND (s.account_id IS NULL OR (s.lease_until < now() AND (
      (s.status IN ('ready','partial') AND (s.cursor IS NOT NULL OR s.last_success_at < now() - interval '12 hours'))
      OR (s.status IN ('error','syncing') AND s.last_attempt_at < now() - interval '12 hours')
      OR (s.status IN ('reconnect','unsupported') AND a.updated_at > s.last_attempt_at)
    )))
  ORDER BY s.last_attempt_at ASC NULLS FIRST LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.claim_winner_sync(uuid), public.next_winner_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_winner_sync(uuid), public.next_winner_account() TO service_role;

CREATE TABLE public.winner_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  finding_key text NOT NULL,
  title text NOT NULL,
  explanation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_post_ids uuid[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  dismissed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, finding_key)
);
CREATE INDEX winner_findings_active ON public.winner_findings(workspace_id, updated_at DESC) WHERE dismissed_at IS NULL;

-- One bounded analysis per workspace at a time; a failed worker can retry.
CREATE TABLE public.winner_analysis_runs (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lease_token uuid NOT NULL,
  lease_until timestamptz NOT NULL DEFAULT now(),
  next_allowed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.winner_analysis_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.winner_analysis_runs FROM PUBLIC, anon, authenticated;
CREATE FUNCTION public.claim_winner_analysis(_workspace_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH claimed AS (
    INSERT INTO public.winner_analysis_runs (workspace_id, lease_token, lease_until, next_allowed_at)
    VALUES (_workspace_id, gen_random_uuid(), now() + interval '10 minutes', now())
    ON CONFLICT (workspace_id) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until
      WHERE public.winner_analysis_runs.lease_until < now() AND public.winner_analysis_runs.next_allowed_at <= now()
    RETURNING lease_token
  ) SELECT lease_token FROM claimed;
$$;
CREATE FUNCTION public.finish_winner_analysis(_workspace_id uuid, _token uuid, _succeeded boolean) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE public.winner_analysis_runs SET lease_until = now(),
    next_allowed_at = now() + CASE WHEN _succeeded THEN interval '6 hours' ELSE interval '10 minutes' END
  WHERE workspace_id = _workspace_id AND lease_token = _token;
$$;
CREATE FUNCTION public.replace_winner_findings(_workspace_id uuid, _token uuid, _generation timestamptz, _findings jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE item jsonb; keys text[] := ARRAY[]::text[];
BEGIN
  PERFORM 1 FROM public.winner_analysis_runs WHERE workspace_id = _workspace_id AND lease_token = _token AND lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Content analysis lease expired'; END IF;
  IF jsonb_typeof(_findings) <> 'array' OR jsonb_array_length(_findings) > 4 THEN RAISE EXCEPTION 'Invalid findings'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(_findings) LOOP
    keys := array_append(keys, item->>'finding_key');
    INSERT INTO public.winner_findings(workspace_id,finding_key,title,explanation,source_post_ids,evidence,active,updated_at)
    VALUES (_workspace_id,item->>'finding_key',item->>'title',item->>'explanation',ARRAY(SELECT jsonb_array_elements_text(item->'source_post_ids')::uuid),item->'evidence',true,_generation)
    ON CONFLICT (workspace_id,finding_key) DO UPDATE SET title=excluded.title, explanation=excluded.explanation,
      source_post_ids=excluded.source_post_ids, evidence=excluded.evidence, active=true, updated_at=excluded.updated_at;
  END LOOP;
  UPDATE public.winner_findings SET active=false WHERE workspace_id=_workspace_id AND NOT (finding_key = ANY(keys));
END $$;
REVOKE ALL ON FUNCTION public.claim_winner_analysis(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_winner_analysis(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_winner_findings(uuid,uuid,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_winner_analysis(uuid), public.finish_winner_analysis(uuid,uuid,boolean), public.replace_winner_findings(uuid,uuid,timestamptz,jsonb) TO service_role;

CREATE TABLE public.winner_shortlist (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  winner_post_id uuid NOT NULL,
  selected_by uuid NOT NULL REFERENCES auth.users(id),
  selected_at timestamptz NOT NULL DEFAULT now(),
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (workspace_id, winner_post_id),
  FOREIGN KEY (workspace_id, winner_post_id) REFERENCES public.winner_posts(workspace_id, id) ON DELETE CASCADE
);

ALTER TABLE public.winner_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winner_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winner_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.winner_shortlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.winner_posts, public.winner_syncs, public.winner_findings, public.winner_shortlist FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.winner_posts, public.winner_syncs, public.winner_findings, public.winner_shortlist, public.winner_analysis_runs TO service_role;
CREATE POLICY winner_posts_read ON public.winner_posts FOR SELECT TO authenticated USING (public.can_access_workspace((select auth.uid()), workspace_id));
CREATE POLICY winner_syncs_read ON public.winner_syncs FOR SELECT TO authenticated USING (public.can_access_workspace((select auth.uid()), workspace_id));
CREATE POLICY winner_findings_read ON public.winner_findings FOR SELECT TO authenticated USING (public.can_access_workspace((select auth.uid()), workspace_id));
CREATE POLICY winner_shortlist_read ON public.winner_shortlist FOR SELECT TO authenticated USING (public.can_access_workspace((select auth.uid()), workspace_id));
GRANT SELECT ON public.winner_posts, public.winner_syncs, public.winner_findings, public.winner_shortlist TO authenticated;

-- Kept inactive until the matching authenticated edge worker is deployed.
INSERT INTO public.internal_job_secrets(name, secret) VALUES ('winner_sync', encode(extensions.gen_random_bytes(32), 'hex')) ON CONFLICT (name) DO NOTHING;
CREATE FUNCTION public.advance_winner_sync() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE job_secret text;
BEGIN
  SELECT secret INTO job_secret FROM public.internal_job_secrets WHERE name = 'winner_sync';
  IF job_secret IS NULL THEN RAISE EXCEPTION 'Winner sync worker authentication is unavailable'; END IF;
  RAISE EXCEPTION 'Winner sync worker scheduling is disabled until configured by the operator';
END $$;
REVOKE ALL ON FUNCTION public.advance_winner_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_winner_sync() TO service_role;
-- Self-host: no winner-sync cron job is installed automatically.
