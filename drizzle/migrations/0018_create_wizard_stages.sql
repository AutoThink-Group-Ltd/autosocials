ALTER TABLE public.creative_batches ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'review';
ALTER TABLE public.creative_batches ADD COLUMN IF NOT EXISTS narratives jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.creative_variants ADD COLUMN IF NOT EXISTS narrative text NOT NULL DEFAULT '';
ALTER TABLE public.creative_batches ADD CONSTRAINT creative_batches_stage_check CHECK (stage IN ('narratives','briefs','producing','review'));