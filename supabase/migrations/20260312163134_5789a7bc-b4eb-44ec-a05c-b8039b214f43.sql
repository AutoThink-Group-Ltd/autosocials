
-- 1. Create a function to auto-create workspace + membership for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_workspace_id uuid;
  user_name text;
  acct_type text;
BEGIN
  -- Get account type
  acct_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'direct');
  
  -- Only auto-create workspace for direct users
  IF acct_type = 'direct' THEN
    user_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1));
    
    INSERT INTO public.workspaces (name)
    VALUES (user_name || '''s Workspace')
    RETURNING id INTO new_workspace_id;
    
    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (NEW.id, new_workspace_id, 'owner');
    
    UPDATE public.profiles
    SET workspace_id = new_workspace_id, primary_workspace_id = new_workspace_id
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Create trigger on auth.users AFTER insert (runs after handle_new_user which creates the profile)
CREATE TRIGGER on_auth_user_created_workspace
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_workspace();

-- 3. Retrospectively create workspace for existing users who don't have one
DO $$
DECLARE
  r RECORD;
  new_ws_id uuid;
BEGIN
  FOR r IN
    SELECT p.id as user_id, p.full_name, p.workspace_id, p.account_type
    FROM public.profiles p
    WHERE p.account_type = 'direct'
      AND (p.workspace_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.workspace_members wm WHERE wm.user_id = p.id
      ))
  LOOP
    -- Create workspace
    INSERT INTO public.workspaces (name)
    VALUES (COALESCE(NULLIF(r.full_name, ''), 'My') || '''s Workspace')
    RETURNING id INTO new_ws_id;
    
    -- Add as owner
    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (r.user_id, new_ws_id, 'owner')
    ON CONFLICT DO NOTHING;
    
    -- Update profile
    UPDATE public.profiles
    SET workspace_id = new_ws_id, primary_workspace_id = new_ws_id
    WHERE id = r.user_id;
  END LOOP;
END;
$$;
