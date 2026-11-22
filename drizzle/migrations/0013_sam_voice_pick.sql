ALTER TABLE public.creative_batches ADD COLUMN IF NOT EXISTS voice_id text, ADD COLUMN IF NOT EXISTS voice_reason text;
ALTER TABLE public.creative_variants ADD COLUMN IF NOT EXISTS voice_id text;
ALTER TABLE public.workspace_voice_settings ADD COLUMN IF NOT EXISTS auto_pick boolean NOT NULL DEFAULT false;