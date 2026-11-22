
-- Create workspace-logos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-logos', 'workspace-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload workspace logos
CREATE POLICY "Authenticated users can upload workspace logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'workspace-logos');

-- Allow anyone to view workspace logos (public bucket)
CREATE POLICY "Anyone can view workspace logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'workspace-logos');

-- Allow authenticated users to update their workspace logos
CREATE POLICY "Authenticated users can update workspace logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'workspace-logos');

-- Allow authenticated users to delete workspace logos
CREATE POLICY "Authenticated users can delete workspace logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workspace-logos');
