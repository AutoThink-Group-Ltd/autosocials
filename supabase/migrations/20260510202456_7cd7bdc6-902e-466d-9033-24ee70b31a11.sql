-- Posts
CREATE TYPE public.post_status AS ENUM ('draft','scheduled','publishing','published','failed');

CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  status public.post_status NOT NULL DEFAULT 'draft',
  caption text NOT NULL DEFAULT '',
  first_comment text,
  hashtags text[] NOT NULL DEFAULT '{}',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_workspace_status_idx ON public.posts(workspace_id, status);
CREATE INDEX posts_scheduled_at_idx ON public.posts(scheduled_at) WHERE status = 'scheduled';

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view posts" ON public.posts
  FOR SELECT USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can insert posts" ON public.posts
  FOR INSERT WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id) AND created_by = auth.uid());
CREATE POLICY "Members can update posts" ON public.posts
  FOR UPDATE USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "Members can delete posts" ON public.posts
  FOR DELETE USING (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Post targets (which connected accounts this post will publish to)
CREATE TYPE public.post_target_status AS ENUM ('pending','publishing','published','failed','skipped');

CREATE TABLE public.post_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  social_account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  status public.post_target_status NOT NULL DEFAULT 'pending',
  platform_post_id text,
  permalink text,
  error text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, social_account_id)
);
CREATE INDEX post_targets_post_idx ON public.post_targets(post_id);

ALTER TABLE public.post_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view targets" ON public.post_targets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members can insert targets" ON public.post_targets
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members can update targets" ON public.post_targets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members can delete targets" ON public.post_targets
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );

CREATE TRIGGER post_targets_set_updated_at BEFORE UPDATE ON public.post_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Post media
CREATE TYPE public.post_media_kind AS ENUM ('image','video');

CREATE TABLE public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  kind public.post_media_kind NOT NULL,
  storage_path text NOT NULL,
  mime text,
  width int,
  height int,
  duration_ms int,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_media_post_idx ON public.post_media(post_id, position);

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view media" ON public.post_media
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members can insert media" ON public.post_media
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members can update media" ON public.post_media
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members can delete media" ON public.post_media
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );

-- Storage bucket for media (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('post-media','post-media', false)
  ON CONFLICT (id) DO NOTHING;

-- Storage policies: workspace-scoped via path prefix `<workspace_id>/...`
CREATE POLICY "Members can read post-media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Members can upload post-media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Members can update post-media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Members can delete post-media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-media'
    AND public.is_workspace_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );