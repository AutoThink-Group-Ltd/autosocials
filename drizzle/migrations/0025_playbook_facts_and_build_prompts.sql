CREATE TABLE public.brand_facts (
  workspace_id uuid PRIMARY KEY,
  does text[] NOT NULL DEFAULT '{}',
  does_not text[] NOT NULL DEFAULT '{}',
  banned_claims text[] NOT NULL DEFAULT '{}',
  banned_colours text[] NOT NULL DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_facts TO authenticated;
GRANT ALL ON public.brand_facts TO service_role;
ALTER TABLE public.brand_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_facts access" ON public.brand_facts FOR ALL TO authenticated
  USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
ALTER TABLE public.creative_variants
  ADD COLUMN IF NOT EXISTS build_prompt text,
  ADD COLUMN IF NOT EXISTS build_prompt_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS build_report jsonb,
  ADD COLUMN IF NOT EXISTS review_stills jsonb,
  ADD COLUMN IF NOT EXISTS qa_score integer,
  ADD COLUMN IF NOT EXISTS is_reference boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opening_visual text;