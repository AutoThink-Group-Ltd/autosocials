-- Protect new bookings without rewriting or rejecting pre-existing collisions.
-- Active delivery states remain occupied until the post leaves the queue.
-- The advisory locks are transaction-scoped and keyed by account, so overlapping
-- bookings serialize even when they belong to different workspaces. Hash
-- collisions merely serialize unrelated accounts; they cannot admit a clash.
CREATE FUNCTION public.guard_post_account_minute()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  candidate_post uuid;
  candidate_time timestamptz;
  candidate_accounts uuid[];
  account_id uuid;
  parent_status text;
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    IF NEW.status::text NOT IN ('scheduled', 'publishing', 'partially_published') OR NEW.scheduled_at IS NULL THEN
      RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status::text IN ('scheduled', 'publishing', 'partially_published')
       AND OLD.scheduled_at IS NOT NULL
       AND date_trunc('minute', OLD.scheduled_at AT TIME ZONE 'UTC') = date_trunc('minute', NEW.scheduled_at AT TIME ZONE 'UTC') THEN
      RETURN NEW;
    END IF;
    candidate_post := NEW.id;
    candidate_time := NEW.scheduled_at;
    SELECT array_agg(t.social_account_id ORDER BY t.social_account_id) INTO candidate_accounts
      FROM public.post_targets t WHERE t.post_id = NEW.id;
  ELSE
    IF TG_OP = 'UPDATE' AND NEW.post_id = OLD.post_id AND NEW.social_account_id = OLD.social_account_id THEN
      RETURN NEW;
    END IF;
    -- Serialize a target insertion with scheduling/rescheduling its parent.
    SELECT p.scheduled_at, p.status::text INTO candidate_time, parent_status FROM public.posts p
      WHERE p.id = NEW.post_id
      FOR UPDATE;
    IF NOT FOUND OR parent_status NOT IN ('scheduled', 'publishing', 'partially_published') OR candidate_time IS NULL THEN RETURN NEW; END IF;
    candidate_post := NEW.post_id;
    candidate_accounts := ARRAY[NEW.social_account_id];
  END IF;

  IF coalesce(cardinality(candidate_accounts), 0) = 0 THEN RETURN NEW; END IF;
  -- The post-lock query below must obtain a fresh snapshot after waiting.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Scheduling requires read committed transaction isolation' USING ERRCODE = '0A000';
  END IF;
  FOREACH account_id IN ARRAY candidate_accounts LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('autosocials:schedule:' || account_id::text, 0));
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.post_targets t JOIN public.posts p ON p.id = t.post_id
    WHERE t.social_account_id = ANY(candidate_accounts) AND p.id <> candidate_post
      AND (p.status::text IN ('scheduled', 'publishing', 'partially_published')
           OR (p.status::text = 'published' AND t.status::text = 'published'))
      AND p.scheduled_at >= date_trunc('minute', candidate_time AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND p.scheduled_at < (date_trunc('minute', candidate_time AT TIME ZONE 'UTC') + interval '1 minute') AT TIME ZONE 'UTC'
  ) THEN
    RAISE EXCEPTION 'A post is already scheduled for this account in that minute. Choose another time.' USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger-only entry point; the owner must see all relevant rows regardless of RLS.
REVOKE ALL ON FUNCTION public.guard_post_account_minute() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER guard_post_account_minute_post
BEFORE INSERT OR UPDATE OF status, scheduled_at ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.guard_post_account_minute();

CREATE TRIGGER guard_post_account_minute_target
BEFORE INSERT OR UPDATE OF post_id, social_account_id ON public.post_targets
FOR EACH ROW EXECUTE FUNCTION public.guard_post_account_minute();
