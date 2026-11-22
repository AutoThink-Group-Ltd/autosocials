CREATE POLICY "Super admins can view all workspaces"
ON public.workspaces
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));