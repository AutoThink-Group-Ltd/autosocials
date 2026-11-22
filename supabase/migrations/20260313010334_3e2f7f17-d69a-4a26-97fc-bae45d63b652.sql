-- Allow anon users to read invitations by token (for accept-invite page)
CREATE POLICY "Anyone can read invitations by token"
ON public.agency_client_invitations
FOR SELECT
TO anon
USING (true);

-- Allow anon to update invitation link_opened_count  
CREATE POLICY "Anyone can update link open tracking"
ON public.agency_client_invitations
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- Allow agency users to delete their invitations
CREATE POLICY "Agency users can delete their invitations"
ON public.agency_client_invitations
FOR DELETE
TO authenticated
USING (agency_user_id = auth.uid());