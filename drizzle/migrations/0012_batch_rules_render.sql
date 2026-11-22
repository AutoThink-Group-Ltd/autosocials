ALTER TABLE public.creative_batches ADD COLUMN IF NOT EXISTS days integer NOT NULL DEFAULT 1, ADD COLUMN IF NOT EXISTS starts_on date;
ALTER TABLE public.creative_variants
  ADD COLUMN IF NOT EXISTS planned_for date,
  ADD COLUMN IF NOT EXISTS duration_s integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS size text NOT NULL DEFAULT '1080x1920',
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS voiceover text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS beats jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.creative_variants ADD CONSTRAINT creative_variants_review_state_chk CHECK (review_state IN ('draft','needs_revision','rejected','approved'));
ALTER TABLE public.creative_variants ADD CONSTRAINT creative_variants_duration_chk CHECK (duration_s IN (15,30));
ALTER TABLE public.creative_batches ADD CONSTRAINT creative_batches_days_chk CHECK (days BETWEEN 1 AND 3);
ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS audio_path text, ADD COLUMN IF NOT EXISTS version integer;