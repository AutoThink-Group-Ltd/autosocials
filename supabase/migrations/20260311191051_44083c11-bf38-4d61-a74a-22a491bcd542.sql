
CREATE POLICY "Allow delete creator_lists" ON public.creator_lists
  FOR DELETE TO anon, authenticated USING (true);
