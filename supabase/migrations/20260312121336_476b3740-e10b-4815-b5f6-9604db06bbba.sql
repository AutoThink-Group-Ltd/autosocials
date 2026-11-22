
-- Create storage bucket for brand assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true);

-- Create brand_asset_folders table for folder/subfolder management
CREATE TABLE public.brand_asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.brand_asset_folders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.brand_asset_folders ENABLE ROW LEVEL SECURITY;

-- Only super_admins can manage folders
CREATE POLICY "Super admins can manage brand asset folders"
  ON public.brand_asset_folders
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Storage RLS policies for brand-assets bucket
CREATE POLICY "Super admins can upload brand assets"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'brand-assets' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update brand assets"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete brand assets"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'brand-assets' AND public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Anyone can view brand assets"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'brand-assets');
