
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE public.post_targets
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'retrying'
      AND enumtypid = 'public.post_target_status'::regtype
  ) THEN
    ALTER TYPE public.post_target_status ADD VALUE 'retrying';
  END IF;
END$$;
