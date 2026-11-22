CREATE OR REPLACE FUNCTION public.get_client_invitation(_token text)
RETURNS TABLE(id uuid, agency_user_id uuid, workspace_id uuid, email text, contact_name text, client_company_name text, status text, role text, invitation_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.id, i.agency_user_id, i.workspace_id, i.email, i.contact_name, i.client_company_name, i.status, i.role, i.invitation_type
  FROM public.agency_client_invitations i WHERE i.token = _token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_client_invitation(_token text, _workspace_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE inv public.agency_client_invitations;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO inv FROM public.agency_client_invitations WHERE token = _token AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF lower(inv.email) <> lower(coalesce(auth.jwt()->>'email','')) THEN RETURN false; END IF;
  IF _workspace_id IS NOT NULL AND NOT public.is_workspace_owner(auth.uid(), _workspace_id) THEN RETURN false; END IF;
  UPDATE public.agency_client_invitations SET status='accepted', accepted_at=now(), client_user_id=auth.uid(),
    workspace_id = coalesce(_workspace_id, workspace_id) WHERE id = inv.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.track_client_invitation_open(_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.agency_client_invitations SET link_opened_count = coalesce(link_opened_count,0)+1, link_last_opened_at=now() WHERE token=_token;
$$;

REVOKE ALL ON FUNCTION public.get_client_invitation(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_client_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_client_invitation(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_client_invitation_open(text) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read invitations by token" ON public.agency_client_invitations;
DROP POLICY IF EXISTS "Anyone can update link open tracking" ON public.agency_client_invitations;

DROP POLICY IF EXISTS "Users can insert their own membership" ON public.workspace_members;
CREATE POLICY "Owners can add members" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_owner(auth.uid(), workspace_id));

DROP POLICY IF EXISTS "Agencies update client members" ON public.workspace_members;
CREATE POLICY "Agencies update client members" ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.is_workspace_agency(auth.uid(), workspace_id) AND role <> 'owner')
  WITH CHECK (public.is_workspace_agency(auth.uid(), workspace_id) AND role IN ('admin','member'));

DROP POLICY IF EXISTS "Agencies remove client members" ON public.workspace_members;
CREATE POLICY "Agencies remove client members" ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_agency(auth.uid(), workspace_id) AND role <> 'owner');