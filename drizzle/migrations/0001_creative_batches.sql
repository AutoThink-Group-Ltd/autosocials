CREATE TABLE public.creative_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled batch',
  goal text NOT NULL DEFAULT '',
  audience text NOT NULL DEFAULT '',
  offer text NOT NULL DEFAULT '',
  destination text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_batches TO authenticated;
GRANT ALL ON public.creative_batches TO service_role;
ALTER TABLE public.creative_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage batches" ON public.creative_batches FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id)) WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE TRIGGER creative_batches_updated BEFORE UPDATE ON public.creative_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.creative_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.creative_batches(id) ON DELETE CASCADE,
  lineage_id uuid NOT NULL DEFAULT gen_random_uuid(),
  version int NOT NULL DEFAULT 1,
  angle text NOT NULL DEFAULT '',
  hook text NOT NULL DEFAULT '',
  format text NOT NULL DEFAULT '',
  script text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  cta text NOT NULL DEFAULT '',
  selected boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.creative_variants(batch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.creative_variants TO authenticated;
GRANT ALL ON public.creative_variants TO service_role;
ALTER TABLE public.creative_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage variants" ON public.creative_variants FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id)) WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE TRIGGER creative_variants_updated BEFORE UPDATE ON public.creative_variants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.creative_variants(id) ON DELETE CASCADE,
  provider_job_id text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  video_url text,
  storage_path text,
  model text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.render_jobs(variant_id);
GRANT SELECT ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read renders" ON public.render_jobs FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE TRIGGER render_jobs_updated BEFORE UPDATE ON public.render_jobs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.generation_allowances (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  monthly_clip_limit int NOT NULL DEFAULT 12,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.generation_allowances TO authenticated;
GRANT ALL ON public.generation_allowances TO service_role;
ALTER TABLE public.generation_allowances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read allowance" ON public.generation_allowances FOR SELECT TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "owners update allowance" ON public.generation_allowances FOR ALL TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id)) WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));
GRANT INSERT, UPDATE ON public.generation_allowances TO authenticated;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.creative_variants(id) ON DELETE SET NULL;