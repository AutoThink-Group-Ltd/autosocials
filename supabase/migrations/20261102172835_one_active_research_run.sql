-- Keep route changes or simultaneous requests from starting duplicate paid scans.
-- Finished reports remain available and do not block a subsequent scan.
create unique index if not exists research_runs_one_active_workspace_idx
  on public.research_runs (workspace_id)
  where status in ('queued', 'fetching', 'analyzing');
