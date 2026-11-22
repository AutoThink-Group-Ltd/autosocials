CREATE TABLE public.seo_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  score int NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  discovery jsonb NOT NULL DEFAULT '[]'::jsonb,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  emailed_at timestamptz,
  created_by uuid
);
GRANT SELECT ON public.seo_audits TO authenticated;
GRANT ALL ON public.seo_audits TO service_role;
ALTER TABLE public.seo_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read SEO audits" ON public.seo_audits FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.indexnow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted int NOT NULL DEFAULT 0,
  status int,
  ok boolean NOT NULL DEFAULT false,
  error text,
  created_by uuid
);
GRANT SELECT ON public.indexnow_log TO authenticated;
GRANT ALL ON public.indexnow_log TO service_role;
ALTER TABLE public.indexnow_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read IndexNow log" ON public.indexnow_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));