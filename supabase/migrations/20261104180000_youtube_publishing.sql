ALTER TABLE public.social_accounts DROP CONSTRAINT IF EXISTS social_accounts_platform_check;
ALTER TABLE public.social_accounts ADD CONSTRAINT social_accounts_platform_check CHECK (platform IN ('facebook','instagram','tiktok','youtube'));
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS youtube_title text NOT NULL DEFAULT '';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS youtube_description text NOT NULL DEFAULT '';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS youtube_visibility text NOT NULL DEFAULT 'public'
  CHECK (youtube_visibility IN ('public','unlisted','private'));
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS youtube_made_for_kids boolean NOT NULL DEFAULT false;
ALTER TABLE public.post_targets ADD COLUMN IF NOT EXISTS youtube_upload_bytes bigint;
ALTER TABLE public.post_targets ADD COLUMN IF NOT EXISTS youtube_upload_total_bytes bigint;
CREATE OR REPLACE FUNCTION public.invalidate_youtube_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND (NEW.youtube_title IS DISTINCT FROM OLD.youtube_title
    OR NEW.youtube_description IS DISTINCT FROM OLD.youtube_description
    OR NEW.youtube_visibility IS DISTINCT FROM OLD.youtube_visibility
    OR NEW.youtube_made_for_kids IS DISTINCT FROM OLD.youtube_made_for_kids
    OR NEW.ai_disclosure IS DISTINCT FROM OLD.ai_disclosure) THEN
    NEW.approved_at = NULL; NEW.approved_by = NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER a_invalidate_youtube_approval BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.invalidate_youtube_approval();
CREATE TABLE public.youtube_oauth_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id uuid NOT NULL,
  access_token text NOT NULL, refresh_token text, scopes text[] NOT NULL DEFAULT '{}',
  channels jsonb NOT NULL, expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  CHECK (jsonb_typeof(channels) = 'array')
);
ALTER TABLE public.youtube_oauth_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_oauth_pending FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.youtube_oauth_pending TO service_role;

