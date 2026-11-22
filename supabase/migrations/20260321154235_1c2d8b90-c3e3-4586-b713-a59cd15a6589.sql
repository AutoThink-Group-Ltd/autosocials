
-- 1. Add workspace_id to creator_lists
ALTER TABLE public.creator_lists ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id);

-- 2. Drop old permissive RLS policies on creator_lists
DROP POLICY IF EXISTS "Allow delete creator_lists" ON public.creator_lists;
DROP POLICY IF EXISTS "Allow insert creator_lists" ON public.creator_lists;
DROP POLICY IF EXISTS "Allow public read of creator_lists" ON public.creator_lists;
DROP POLICY IF EXISTS "Allow update creator_lists" ON public.creator_lists;

-- 3. Create workspace-scoped RLS policies for creator_lists
CREATE POLICY "Workspace members can view lists"
  ON public.creator_lists FOR SELECT
  TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can insert lists"
  ON public.creator_lists FOR INSERT
  TO authenticated
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can update lists"
  ON public.creator_lists FOR UPDATE
  TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id))
  WITH CHECK (is_workspace_member(auth.uid(), workspace_id));

CREATE POLICY "Workspace members can delete lists"
  ON public.creator_lists FOR DELETE
  TO authenticated
  USING (is_workspace_member(auth.uid(), workspace_id));

-- 4. Drop old permissive RLS policies on list_members  
DROP POLICY IF EXISTS "Allow delete list_members" ON public.list_members;
DROP POLICY IF EXISTS "Allow insert list_members" ON public.list_members;
DROP POLICY IF EXISTS "Allow public read of list_members" ON public.list_members;

-- 5. Create workspace-scoped RLS policies for list_members (via parent list)
CREATE POLICY "Workspace members can view list members"
  ON public.list_members FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.creator_lists cl
    WHERE cl.id = list_members.list_id
    AND is_workspace_member(auth.uid(), cl.workspace_id)
  ));

CREATE POLICY "Workspace members can insert list members"
  ON public.list_members FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.creator_lists cl
    WHERE cl.id = list_members.list_id
    AND is_workspace_member(auth.uid(), cl.workspace_id)
  ));

CREATE POLICY "Workspace members can delete list members"
  ON public.list_members FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.creator_lists cl
    WHERE cl.id = list_members.list_id
    AND is_workspace_member(auth.uid(), cl.workspace_id)
  ));

-- 6. Tighten creator_profiles INSERT/UPDATE to authenticated only
DROP POLICY IF EXISTS "Allow insert from service role" ON public.creator_profiles;
DROP POLICY IF EXISTS "Allow update from service role" ON public.creator_profiles;

CREATE POLICY "Authenticated users can insert creator profiles"
  ON public.creator_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update creator profiles"
  ON public.creator_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
