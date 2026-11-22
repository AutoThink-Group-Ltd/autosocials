CREATE OR REPLACE FUNCTION public.is_workspace_member(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members
      WHERE user_id = _user_id
        AND workspace_id = _workspace_id
    );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    has_role(_user_id, 'super_admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members
      WHERE user_id = _user_id
        AND workspace_id = _workspace_id
        AND role = 'owner'
    );
$$;