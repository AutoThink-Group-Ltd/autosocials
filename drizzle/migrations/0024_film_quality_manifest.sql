ALTER TABLE public.brand_files
  ADD COLUMN IF NOT EXISTS width integer,
  ADD COLUMN IF NOT EXISTS height integer,
  ADD COLUMN IF NOT EXISTS has_alpha boolean,
  ADD COLUMN IF NOT EXISTS bg_tone text,
  ADD COLUMN IF NOT EXISTS media_role text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS inspected_at timestamptz;
ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS qa_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS composition_html text,
  ADD COLUMN IF NOT EXISTS caption_mode text;
ALTER TABLE public.creative_variants
  ADD COLUMN IF NOT EXISTS argument text;