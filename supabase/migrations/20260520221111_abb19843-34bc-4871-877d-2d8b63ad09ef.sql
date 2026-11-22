
-- media_assets table
CREATE TABLE public.media_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID,
  created_by UUID,
  source TEXT NOT NULL DEFAULT 'shutterstock',
  image_id TEXT,
  license_id TEXT,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  alt TEXT NOT NULL,
  filename TEXT NOT NULL,
  query TEXT,
  width INTEGER,
  height INTEGER,
  mime_type TEXT DEFAULT 'image/jpeg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_assets_workspace ON public.media_assets(workspace_id);
CREATE INDEX idx_media_assets_image_id ON public.media_assets(image_id);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view media"
  ON public.media_assets FOR SELECT
  USING (workspace_id IS NULL OR public.is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members insert media"
  ON public.media_assets FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Workspace members delete media"
  ON public.media_assets FOR DELETE
  USING (workspace_id IS NULL OR public.is_workspace_member(auth.uid(), workspace_id));

CREATE TRIGGER set_media_assets_updated_at
  BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public storage bucket for licensed media
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read media bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "Authenticated upload media bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated delete media bucket"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media' AND auth.role() = 'authenticated');
