DROP POLICY IF EXISTS "members manage batches" ON public.creative_batches;
CREATE POLICY "workspace access manage batches" ON public.creative_batches FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
DROP POLICY IF EXISTS "members manage variants" ON public.creative_variants;
CREATE POLICY "workspace access manage variants" ON public.creative_variants FOR ALL TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id)) WITH CHECK (public.can_access_workspace(auth.uid(), workspace_id));
DROP POLICY IF EXISTS "members read renders" ON public.render_jobs;
CREATE POLICY "workspace access read renders" ON public.render_jobs FOR SELECT TO authenticated USING (public.can_access_workspace(auth.uid(), workspace_id));