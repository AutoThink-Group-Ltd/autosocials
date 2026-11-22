
-- Posts: post format and platform-control fields
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS post_type text NOT NULL DEFAULT 'feed',
  ADD COLUMN IF NOT EXISTS privacy_level text DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS comments_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duet_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stitch_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS branded_content boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_disclosure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_id text,
  ADD COLUMN IF NOT EXISTS user_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS collaborators jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Post media: alt text and cover frame hint
ALTER TABLE public.post_media
  ADD COLUMN IF NOT EXISTS alt_text text,
  ADD COLUMN IF NOT EXISTS thumb_offset_ms integer;

-- Post targets: per-platform caption + first comment overrides
ALTER TABLE public.post_targets
  ADD COLUMN IF NOT EXISTS caption_override text,
  ADD COLUMN IF NOT EXISTS first_comment_override text;

-- Hashtag groups
CREATE TABLE IF NOT EXISTS public.hashtag_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  hashtags text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hashtag_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read hashtag groups"
  ON public.hashtag_groups FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "owners manage hashtag groups"
  ON public.hashtag_groups FOR ALL
  USING (public.is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

CREATE TRIGGER hashtag_groups_updated
  BEFORE UPDATE ON public.hashtag_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Best post times (per workspace + platform)
CREATE TABLE IF NOT EXISTS public.best_post_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  hour smallint NOT NULL CHECK (hour BETWEEN 0 AND 23),
  score numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'heuristic',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, platform, day_of_week, hour)
);
ALTER TABLE public.best_post_times ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read best times"
  ON public.best_post_times FOR SELECT
  USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "owners manage best times"
  ON public.best_post_times FOR ALL
  USING (public.is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

-- TikTok rate-limit tracking (per social account, per 24h window)
CREATE TABLE IF NOT EXISTS public.platform_publish_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  social_account_id uuid NOT NULL,
  platform text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_publish_log_account_time_idx
  ON public.platform_publish_log (social_account_id, published_at DESC);
ALTER TABLE public.platform_publish_log ENABLE ROW LEVEL SECURITY;
-- service-role only; no public policies
