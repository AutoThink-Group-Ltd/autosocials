
CREATE TABLE public.meta_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'instagram_temp',
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  identifier TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  connection_status TEXT DEFAULT 'pending',
  connection_metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of meta_data_sources"
ON public.meta_data_sources FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow insert meta_data_sources"
ON public.meta_data_sources FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow update meta_data_sources"
ON public.meta_data_sources FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);
