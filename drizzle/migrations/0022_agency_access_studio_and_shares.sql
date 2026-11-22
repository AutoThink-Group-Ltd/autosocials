CREATE POLICY "authorised access posts" ON public.posts FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
CREATE POLICY "authorised access post media" ON public.post_media FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id AND public.can_access_workspace(auth.uid(), p.workspace_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id AND public.can_access_workspace(auth.uid(), p.workspace_id)));
CREATE POLICY "authorised access post targets" ON public.post_targets FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_targets.post_id AND public.can_access_workspace(auth.uid(), p.workspace_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_targets.post_id AND public.can_access_workspace(auth.uid(), p.workspace_id)));
CREATE POLICY "authorised read approval events" ON public.post_approval_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_approval_events.post_id AND public.can_access_workspace(auth.uid(), p.workspace_id)));
CREATE POLICY "authorised access threads" ON public.agent_threads FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
CREATE POLICY "authorised access messages" ON public.agent_messages FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
CREATE POLICY "authorised access canvases" ON public.canvases FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
CREATE POLICY "authorised read agent runs" ON public.agent_runs FOR SELECT TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id));
CREATE POLICY "authorised read post agent events" ON public.post_agent_events FOR SELECT TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id));

ALTER TABLE public.render_jobs ADD COLUMN IF NOT EXISTS progress integer, ADD COLUMN IF NOT EXISTS phase text, ADD COLUMN IF NOT EXISTS started_at timestamptz;

CREATE TABLE public.video_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  variant_ids uuid[] NOT NULL,
  title text,
  created_by uuid NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.video_shares TO authenticated;
GRANT ALL ON public.video_shares TO service_role;
ALTER TABLE public.video_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace manages shares" ON public.video_shares FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id) AND created_by = auth.uid());