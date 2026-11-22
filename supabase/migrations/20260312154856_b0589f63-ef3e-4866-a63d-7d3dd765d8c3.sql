INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('email-assets', 'email-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

CREATE POLICY "Public read access on email-assets" ON storage.objects
FOR SELECT TO public USING (bucket_id = 'email-assets');

CREATE POLICY "Authenticated upload on email-assets" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'email-assets');