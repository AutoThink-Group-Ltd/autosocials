
-- Create workspace-logos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('workspace-logos', 'workspace-logos', true, 15728640, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for workspace-logos bucket
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'workspace-logos');

CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'workspace-logos');

CREATE POLICY "Authenticated users can update their logos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'workspace-logos');

CREATE POLICY "Authenticated users can delete their logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'workspace-logos');
