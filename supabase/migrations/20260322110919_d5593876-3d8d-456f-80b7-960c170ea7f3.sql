
-- Email folders table
CREATE TABLE public.email_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gray',
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.email_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view folders"
  ON public.email_folders FOR SELECT TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace owners can manage folders"
  ON public.email_folders FOR ALL TO authenticated
  USING (is_workspace_owner(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_owner(auth.uid(), workspace_id));

-- Add folder_id to email_send_log
ALTER TABLE public.email_send_log ADD COLUMN folder_id uuid REFERENCES public.email_folders(id) ON DELETE SET NULL;

-- Add folder_id to email_replies
ALTER TABLE public.email_replies ADD COLUMN folder_id uuid REFERENCES public.email_folders(id) ON DELETE SET NULL;

-- Add is_read to email_replies for unread tracking
ALTER TABLE public.email_replies ADD COLUMN is_read boolean NOT NULL DEFAULT false;

-- Allow deleting from email_send_log
CREATE POLICY "Workspace members can delete email logs"
  ON public.email_send_log FOR DELETE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Allow deleting from email_replies
CREATE POLICY "Workspace members can delete replies"
  ON public.email_replies FOR DELETE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- Allow updating email_send_log (for folder assignment)
CREATE POLICY "Workspace members can update email logs"
  ON public.email_send_log FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

-- Allow updating email_replies (for is_read, folder assignment)
CREATE POLICY "Workspace members can update replies"
  ON public.email_replies FOR UPDATE TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));
