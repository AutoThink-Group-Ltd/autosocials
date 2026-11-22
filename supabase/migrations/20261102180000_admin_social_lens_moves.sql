-- Keep an audit trail even if a report or workspace is later removed.
CREATE TABLE public.research_report_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id uuid NOT NULL,
  from_workspace_id uuid NOT NULL,
  to_workspace_id uuid NOT NULL,
  moved_by uuid NOT NULL,
  active_share_count integer NOT NULL,
  links_revoked boolean NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.research_report_moves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_report_moves FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.research_report_moves TO service_role;

-- One transaction moves the saved report and every share record together.
CREATE FUNCTION public.admin_move_research_report(
  _run_id uuid,
  _expected_workspace_id uuid,
  _target_workspace_id uuid,
  _actor_user_id uuid,
  _revoke_shares boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  current_workspace_id uuid;
  current_status text;
  active_shares integer;
BEGIN
  IF _expected_workspace_id = _target_workspace_id THEN
    RAISE EXCEPTION 'Choose a different workspace';
  END IF;

  SELECT workspace_id, status INTO current_workspace_id, current_status
  FROM public.research_runs WHERE id = _run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;
  IF current_workspace_id <> _expected_workspace_id THEN
    RAISE EXCEPTION 'Report workspace changed; refresh and try again';
  END IF;
  IF current_status IN ('queued', 'fetching', 'analyzing') THEN
    RAISE EXCEPTION 'Wait for the report to finish before moving it';
  END IF;
  PERFORM 1 FROM public.workspaces WHERE id = _target_workspace_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Destination workspace not found'; END IF;

  SELECT count(*) INTO active_shares FROM public.research_report_shares
  WHERE research_run_id = _run_id AND revoked_at IS NULL;

  UPDATE public.research_runs SET workspace_id = _target_workspace_id,
    version = version + 1, updated_at = now() WHERE id = _run_id;
  UPDATE public.research_report_shares SET workspace_id = _target_workspace_id,
    revoked_at = CASE WHEN _revoke_shares THEN COALESCE(revoked_at, now()) ELSE revoked_at END,
    updated_at = now() WHERE research_run_id = _run_id;

  INSERT INTO public.research_report_moves
    (research_run_id, from_workspace_id, to_workspace_id, moved_by, active_share_count, links_revoked)
  VALUES (_run_id, _expected_workspace_id, _target_workspace_id, _actor_user_id, active_shares, _revoke_shares);

  RETURN jsonb_build_object('ok', true, 'revokedShareCount', CASE WHEN _revoke_shares THEN active_shares ELSE 0 END);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_move_research_report(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_move_research_report(uuid,uuid,uuid,uuid,boolean) TO service_role;
