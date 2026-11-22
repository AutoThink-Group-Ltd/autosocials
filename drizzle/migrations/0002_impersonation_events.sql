CREATE TABLE public.impersonation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, UPDATE ON public.impersonation_events TO authenticated;
GRANT ALL ON public.impersonation_events TO service_role;
ALTER TABLE public.impersonation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read switch log" ON public.impersonation_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admins close their own switches" ON public.impersonation_events
  FOR UPDATE TO authenticated
  USING (actor_id = auth.uid() AND public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (actor_id = auth.uid());
CREATE INDEX impersonation_events_actor_idx ON public.impersonation_events (actor_id, started_at DESC);