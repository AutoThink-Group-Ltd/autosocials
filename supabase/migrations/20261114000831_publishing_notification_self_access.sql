CREATE OR REPLACE FUNCTION public.set_publish_notification_setting(_workspace_id uuid, _actor_id uuid, _action text, _user_id uuid, _value boolean)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE previous jsonb; current_value jsonb;
BEGIN
  IF _action = 'master' THEN
    SELECT jsonb_build_object('enabled', enabled) INTO previous FROM public.publish_notification_settings WHERE workspace_id = _workspace_id;
    INSERT INTO public.publish_notification_settings(workspace_id,enabled,updated_by) VALUES (_workspace_id,_value,_actor_id)
    ON CONFLICT (workspace_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now();
    current_value := jsonb_build_object('enabled',_value);
  ELSIF _action IN ('selection','self') THEN
    IF _action = 'selection' AND NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _user_id) THEN
      RAISE EXCEPTION 'Recipient is not an active member';
    END IF;
    IF _action = 'self' AND (_actor_id IS DISTINCT FROM _user_id OR NOT (public.is_workspace_member(_user_id, _workspace_id) OR public.is_workspace_agency(_user_id, _workspace_id))) THEN
      RAISE EXCEPTION 'Recipient does not have workspace access';
    END IF;
    SELECT jsonb_build_object('selected', selected, 'opted_in', opted_in) INTO previous FROM public.publish_notification_recipients WHERE workspace_id = _workspace_id AND user_id = _user_id;
    IF _action = 'selection' THEN
      INSERT INTO public.publish_notification_recipients(workspace_id,user_id,selected,updated_by) VALUES (_workspace_id,_user_id,_value,_actor_id)
      ON CONFLICT (workspace_id,user_id) DO UPDATE SET selected = EXCLUDED.selected, updated_by = EXCLUDED.updated_by, updated_at = now();
    ELSE
      INSERT INTO public.publish_notification_recipients(workspace_id,user_id,selected,opted_in,updated_by) VALUES (_workspace_id,_user_id,true,_value,_actor_id)
      ON CONFLICT (workspace_id,user_id) DO UPDATE SET opted_in = EXCLUDED.opted_in, updated_by = EXCLUDED.updated_by, updated_at = now();
    END IF;
    SELECT jsonb_build_object('selected', selected, 'opted_in', opted_in) INTO current_value FROM public.publish_notification_recipients WHERE workspace_id = _workspace_id AND user_id = _user_id;
  ELSE RAISE EXCEPTION 'Invalid setting';
  END IF;
  INSERT INTO public.publish_notification_audit(workspace_id,subject_user_id,actor_id,kind,old_value,new_value)
  VALUES (_workspace_id,CASE WHEN _action = 'master' THEN NULL ELSE _user_id END,_actor_id,_action,previous,current_value);
END $$;
