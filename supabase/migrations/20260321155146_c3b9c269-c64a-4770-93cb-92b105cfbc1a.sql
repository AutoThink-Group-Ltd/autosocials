
-- Add workspace_id to search_queries for workspace scoping
ALTER TABLE public.search_queries ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id);
ALTER TABLE public.search_queries ADD COLUMN IF NOT EXISTS user_id uuid;

-- Drop old permissive policies
DROP POLICY IF EXISTS "Allow insert search queries" ON public.search_queries;
DROP POLICY IF EXISTS "Allow public read of search queries" ON public.search_queries;
DROP POLICY IF EXISTS "Allow update search queries" ON public.search_queries;

-- Create workspace-scoped policies
CREATE POLICY "Workspace members can view search queries"
  ON public.search_queries FOR SELECT TO authenticated
  USING (
    workspace_id IS NULL OR is_workspace_member(auth.uid(), workspace_id)
  );

CREATE POLICY "Authenticated users can insert search queries"
  ON public.search_queries FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Workspace members can update search queries"
  ON public.search_queries FOR UPDATE TO authenticated
  USING (
    workspace_id IS NULL OR is_workspace_member(auth.uid(), workspace_id)
  );

-- Allow email_send_log status updates (needed for webhook status tracking)
DROP POLICY IF EXISTS "Service role can update email status" ON public.email_send_log;
