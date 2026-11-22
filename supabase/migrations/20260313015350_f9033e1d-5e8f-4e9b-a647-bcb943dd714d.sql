CREATE OR REPLACE FUNCTION public.handle_new_user_workspace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_workspace_id uuid;
  user_name text;
  acct_type text;
BEGIN
  acct_type := COALESCE(NEW.raw_user_meta_data->>'account_type', 'direct');
  
  -- Only create workspace for direct users, NOT agency users
  IF acct_type = 'direct' THEN
    user_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), split_part(NEW.email, '@', 1));
    
    INSERT INTO public.workspaces (name)
    VALUES (user_name)
    RETURNING id INTO new_workspace_id;
    
    INSERT INTO public.workspace_members (user_id, workspace_id, role)
    VALUES (NEW.id, new_workspace_id, 'owner');
    
    UPDATE public.profiles
    SET workspace_id = new_workspace_id, primary_workspace_id = new_workspace_id
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;