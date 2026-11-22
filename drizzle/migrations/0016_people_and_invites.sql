-- Agency staff helpers
CREATE OR REPLACE FUNCTION public.agency_staff_owner(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(
    (SELECT user_id FROM public.agency_profiles WHERE user_id = _user_id LIMIT 1),
    (SELECT agency_user_id FROM public.agency_employees WHERE employee_user_id = _user_id AND is_active ORDER BY created_at LIMIT 1)
  );
$$;

CREATE OR REPLACE FUNCTION public.agency_staff_role(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.agency_profiles WHERE user_id = _user_id) THEN 'owner'
    ELSE (SELECT CASE WHEN role = 'admin' THEN 'admin' ELSE 'member' END
          FROM public.agency_employees WHERE employee_user_id = _user_id AND is_active ORDER BY created_at LIMIT 1)
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_agency_admin_of(_user_id uuid, _agency_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id = _agency_owner OR EXISTS (
    SELECT 1 FROM public.agency_employees
    WHERE employee_user_id = _user_id AND agency_user_id = _agency_owner AND is_active AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.employee_can_access_client(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agency_employees e
    JOIN public.agency_client_links l ON l.agency_user_id = e.agency_user_id AND l.workspace_id = _workspace_id AND l.status = 'active'
    LEFT JOIN public.agency_clients c ON c.agency_user_id = e.agency_user_id AND c.workspace_id = _workspace_id
    WHERE e.employee_user_id = _user_id AND e.is_active
      AND (e.role = 'admin' OR e.client_access = 'all' OR c.id = ANY(e.client_ids)));
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_agency(_user_id uuid, _workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.agency_client_links
    WHERE agency_user_id = _user_id AND workspace_id = _workspace_id AND status = 'active')
  OR public.employee_can_access_client(_user_id, _workspace_id);
$$;

CREATE OR REPLACE FUNCTION public.find_user_id_by_email(_email text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_user_id_by_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_workspace_members_with_email(_workspace_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wm.user_id, p.full_name, u.email::text, wm.role
  FROM public.workspace_members wm
  JOIN public.profiles p ON p.id = wm.user_id
  JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = _workspace_id
    AND (auth.uid() IS NULL OR public.can_access_workspace(auth.uid(), _workspace_id));
$$;

-- Invited users never get an auto-created workspace
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE new_workspace_id uuid; user_name text; acct_type text;
BEGIN
  acct_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'direct');
  IF acct_type = 'direct' THEN
    user_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1));
    INSERT INTO public.workspaces (name) VALUES (user_name) RETURNING id INTO new_workspace_id;
    INSERT INTO public.workspace_members (user_id, workspace_id, role) VALUES (NEW.id, new_workspace_id, 'owner');
    UPDATE public.profiles SET workspace_id = new_workspace_id, primary_workspace_id = new_workspace_id WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

-- Workspace invitations
CREATE TABLE public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'member',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  sent_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  accepted_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace managers view invitations" ON public.workspace_invitations FOR SELECT TO authenticated
  USING (public.is_workspace_owner(auth.uid(), workspace_id) OR public.is_workspace_agency(auth.uid(), workspace_id)
    OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = workspace_invitations.workspace_id AND m.user_id = auth.uid() AND m.role = 'admin'));
-- Hide tokens from browser reads
REVOKE SELECT (token) ON public.workspace_invitations FROM authenticated;

ALTER TABLE public.agency_employee_invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT now() + interval '7 days';
ALTER TABLE public.agency_employee_invitations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.agency_employee_invitations TO authenticated;
GRANT ALL ON public.agency_employee_invitations TO service_role;
CREATE POLICY "Agency admins view staff invitations" ON public.agency_employee_invitations FOR SELECT TO authenticated
  USING (public.is_agency_admin_of(auth.uid(), agency_user_id));
REVOKE SELECT (token) ON public.agency_employee_invitations FROM authenticated;

-- Staff access to agency data
CREATE POLICY "Agency admins manage staff" ON public.agency_employees FOR ALL TO authenticated
  USING (public.is_agency_admin_of(auth.uid(), agency_user_id)) WITH CHECK (public.is_agency_admin_of(auth.uid(), agency_user_id));
CREATE POLICY "Agency staff view clients" ON public.agency_clients FOR SELECT TO authenticated
  USING (public.is_agency_admin_of(auth.uid(), agency_user_id) OR public.employee_can_access_client(auth.uid(), workspace_id));
CREATE POLICY "Agency staff view links" ON public.agency_client_links FOR SELECT TO authenticated
  USING (public.is_workspace_agency(auth.uid(), workspace_id));
CREATE POLICY "Agency staff view agency profile" ON public.agency_profiles FOR SELECT TO authenticated
  USING (user_id = public.agency_staff_owner(auth.uid()));

-- Agencies manage their clients' people
CREATE POLICY "Agencies view client members" ON public.workspace_members FOR SELECT TO authenticated
  USING (public.is_workspace_agency(auth.uid(), workspace_id));
CREATE POLICY "Agencies update client members" ON public.workspace_members FOR UPDATE TO authenticated
  USING (public.is_workspace_agency(auth.uid(), workspace_id));
CREATE POLICY "Agencies remove client members" ON public.workspace_members FOR DELETE TO authenticated
  USING (public.is_workspace_agency(auth.uid(), workspace_id));
CREATE POLICY "Agencies read client member profiles" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = profiles.id AND public.is_workspace_agency(auth.uid(), wm.workspace_id)));
