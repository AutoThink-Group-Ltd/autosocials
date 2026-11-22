
CREATE OR REPLACE FUNCTION public.get_workspace_members_with_email(_workspace_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, role text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    wm.user_id,
    p.full_name,
    u.email::text,
    wm.role
  FROM public.workspace_members wm
  JOIN public.profiles p ON p.id = wm.user_id
  JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = _workspace_id
$$;
