-- Use the same workspace access check as the posts write policy for agency-managed clients.
CREATE OR REPLACE FUNCTION public.enforce_publish_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE approval_required boolean;
BEGIN
  IF auth.role() = 'authenticated' THEN
    IF NOT coalesce(public.can_access_workspace(auth.uid(), NEW.workspace_id), false) THEN RAISE EXCEPTION 'Workspace access required'; END IF;
    IF NEW.approved_at IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
      IF NOT public.is_workspace_owner(auth.uid(), NEW.workspace_id) AND NOT EXISTS (
        SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = NEW.workspace_id
        AND m.user_id = auth.uid() AND m.role = 'admin'
      ) THEN RAISE EXCEPTION 'Only authorised approvers can approve posts'; END IF;
      IF NEW.approved_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Approval must identify the current user'; END IF;
    END IF;
    SELECT w.requires_approval INTO approval_required FROM public.workspaces w WHERE w.id = NEW.workspace_id;
    IF TG_OP = 'UPDATE' AND (NEW.caption IS DISTINCT FROM OLD.caption OR NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at
      OR NEW.first_comment IS DISTINCT FROM OLD.first_comment) THEN
      NEW.approved_at = NULL; NEW.approved_by = NULL;
    END IF;
    IF approval_required AND NEW.status IN ('scheduled','publishing') AND NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'This workspace requires approval before publishing';
    END IF;
    IF NEW.status IN ('publishing','published','partially_published') THEN
      RAISE EXCEPTION 'Delivery status is managed by the publishing worker';
    END IF;
  END IF;
  RETURN NEW;
END $$;
