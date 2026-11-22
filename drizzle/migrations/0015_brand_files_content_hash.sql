ALTER TABLE public.brand_files ADD COLUMN IF NOT EXISTS content_hash text;
CREATE INDEX IF NOT EXISTS brand_files_ws_hash_idx ON public.brand_files (workspace_id, content_hash);