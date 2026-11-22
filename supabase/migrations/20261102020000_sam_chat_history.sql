-- Allow separate Sam conversations without deleting existing client history.
-- Created using the repository naming convention: the Supabase CLI was unavailable.
ALTER TABLE public.agent_threads
  DROP CONSTRAINT IF EXISTS agent_threads_workspace_id_module_key;

CREATE INDEX IF NOT EXISTS agent_threads_workspace_module_updated_idx
  ON public.agent_threads (workspace_id, module, updated_at DESC, id DESC);

-- Existing workspace RLS policies and grants continue to govern every thread.
