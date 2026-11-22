-- Brand guidelines: source-of-truth for AutoSocials brand + UX design system.
CREATE TABLE public.brand_guidelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'AutoSocials',
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  tokens jsonb NOT NULL DEFAULT '{}'::jsonb,
  voice jsonb NOT NULL DEFAULT '{}'::jsonb,
  ux_principles jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX brand_guidelines_one_active
  ON public.brand_guidelines (is_active)
  WHERE is_active = true;

ALTER TABLE public.brand_guidelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view brand guidelines"
  ON public.brand_guidelines FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can insert brand guidelines"
  ON public.brand_guidelines FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update brand guidelines"
  ON public.brand_guidelines FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can delete brand guidelines"
  ON public.brand_guidelines FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER brand_guidelines_set_updated_at
  BEFORE UPDATE ON public.brand_guidelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial active record with AutoSocials tokens.
INSERT INTO public.brand_guidelines (name, version, is_active, tokens, voice, ux_principles, notes)
VALUES (
  'AutoSocials',
  1,
  true,
  jsonb_build_object(
    'palette', jsonb_build_object(
      'primary', '262 83% 58%',
      'primary_glow', '262 90% 70%',
      'background', '0 0% 100%',
      'foreground', '240 10% 10%',
      'muted', '240 5% 96%',
      'muted_foreground', '240 4% 46%',
      'border', '240 6% 90%',
      'accent', '262 83% 96%',
      'destructive', '0 72% 51%',
      'success', '142 71% 45%',
      'warning', '38 92% 50%'
    ),
    'dark_palette', jsonb_build_object(
      'background', '240 10% 4%',
      'foreground', '0 0% 98%',
      'border_min_lightness', '40%'
    ),
    'typography', jsonb_build_object(
      'sans', 'Inter, ui-sans-serif, system-ui',
      'display', 'Inter, ui-sans-serif, system-ui',
      'scale', jsonb_build_object('xs','0.75rem','sm','0.875rem','base','1rem','lg','1.125rem','xl','1.25rem','2xl','1.5rem','3xl','1.875rem','4xl','2.25rem')
    ),
    'spacing_scale', '4px base, 8/12/16/24/32/48',
    'radius', jsonb_build_object('sm','0.375rem','md','0.5rem','lg','0.75rem','xl','1rem'),
    'motion', jsonb_build_object('default_ms', 180, 'easing', 'cubic-bezier(0.16, 1, 0.3, 1)', 'philosophy', 'calm, never bouncy')
  ),
  jsonb_build_object(
    'tone', 'Calm, confident, expert. Never hypey.',
    'forbidden_terms', jsonb_build_array('leads', 'scraping', 'scrape'),
    'preferred_terms', jsonb_build_array('creators', 'scanning', 'live search'),
    'year_reference', '2026'
  ),
  jsonb_build_object(
    'principle', 'Outcome-first, agent-first, minimal by default, detailed on demand.',
    'layers', jsonb_build_array('Command','Status','Context','Control','Inspection','Deep Workspace','Notification'),
    'rules', jsonb_build_array(
      'Never use a full page when a drawer is enough',
      'Never show dense data by default',
      'Never make AI feel like magic with no explanation',
      'Always show what the system is doing and what the user can do next',
      'Risky actions require explicit confirmation'
    )
  ),
  'Initial seed. Edit via /app/admin/brand-guidelines.'
);