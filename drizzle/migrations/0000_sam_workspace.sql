CREATE TABLE public.agent_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  module text NOT NULL CHECK (module IN ('create','schedule','winners','campaigns','learn')),
  title text NOT NULL DEFAULT 'Current cycle',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_threads TO authenticated;
GRANT ALL ON public.agent_threads TO service_role;
ALTER TABLE public.agent_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage threads" ON public.agent_threads FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.agent_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  canvas_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage messages" ON public.agent_messages FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX ON public.agent_messages(thread_id, created_at);

CREATE TABLE public.canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  module text NOT NULL,
  title text NOT NULL,
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  pinned boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  updated_by text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canvases TO authenticated;
GRANT ALL ON public.canvases TO service_role;
ALTER TABLE public.canvases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members manage canvases" ON public.canvases FOR ALL TO authenticated
  USING (public.is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE INDEX ON public.canvases(workspace_id, module, updated_at DESC);

CREATE TABLE public.brand_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  tokens jsonb NOT NULL,
  voice jsonb NOT NULL DEFAULT '{}'::jsonb,
  agent jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brand_releases TO authenticated;
GRANT INSERT, UPDATE ON public.brand_releases TO authenticated;
GRANT ALL ON public.brand_releases TO service_role;
ALTER TABLE public.brand_releases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read published or admin" ON public.brand_releases FOR SELECT TO authenticated
  USING (published OR public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "super admin writes" ON public.brand_releases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE POLICY "super admin updates" ON public.brand_releases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'));

INSERT INTO public.brand_releases (version, tokens, voice, agent, notes, published, published_at) VALUES (
 '1.0.0',
 '{"canvas":"#F5F3EE","surface":"#FFFFFF","surface-subtle":"#EEEBE4","ink":"#171715","ink-hover":"#2B2B27","text-secondary":"#64615B","text-muted":"#6D6962","border-subtle":"#E4E1DA","border-control":"#88847B","silver":"#B8B6B0","danger":"#9D2D20","danger-surface":"#FFF2EF","warning":"#805115","warning-surface":"#FFF5E8","font-display":"Plus Jakarta Sans","font-ui":"Inter","font-editorial":"Instrument Serif"}',
 '{"spelling":"British English","say":["creators","scanning"],"avoid":["leads","scraping","girlboss","hype"]}',
 '{"name":"Sam","role":"AI social growth agent","age":32,"voice":"natural British English"}',
 'Initial monochrome release — warm ivory, carbon black, soft silver.', true, now());