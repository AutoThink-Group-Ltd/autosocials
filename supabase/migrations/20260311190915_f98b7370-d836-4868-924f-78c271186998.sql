
-- Lists table
CREATE TABLE public.creator_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.creator_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of creator_lists" ON public.creator_lists
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow insert creator_lists" ON public.creator_lists
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow update creator_lists" ON public.creator_lists
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- List members junction table
CREATE TABLE public.list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.creator_lists(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.creator_profiles(id) ON DELETE CASCADE,
  added_at timestamptz DEFAULT now(),
  UNIQUE(list_id, creator_id)
);

ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of list_members" ON public.list_members
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow insert list_members" ON public.list_members
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow delete list_members" ON public.list_members
  FOR DELETE TO anon, authenticated USING (true);
