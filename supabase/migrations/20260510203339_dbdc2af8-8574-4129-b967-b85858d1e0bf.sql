-- Add new status
ALTER TYPE public.post_status ADD VALUE IF NOT EXISTS 'awaiting_approval' BEFORE 'scheduled';

-- Workspace toggle
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS requires_approval boolean NOT NULL DEFAULT false;

-- Approval columns on posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS submitted_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Audit table
CREATE TABLE IF NOT EXISTS public.post_approval_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('submitted','approved','rejected','comment')),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_approval_events_post_idx ON public.post_approval_events(post_id, created_at DESC);

ALTER TABLE public.post_approval_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read approval events" ON public.post_approval_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );
CREATE POLICY "Members insert approval events" ON public.post_approval_events
  FOR INSERT WITH CHECK (
    actor_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND public.is_workspace_member(auth.uid(), p.workspace_id))
  );

-- Owner-only update policy for approve/reject (members can still update their own drafts via existing policy)
-- The existing "Members can update posts" policy already allows updates; we layer a workspace-level check via app code.
-- For requires_approval toggle on workspaces, owners only — handled in the workspaces table policies (existing owner check).
