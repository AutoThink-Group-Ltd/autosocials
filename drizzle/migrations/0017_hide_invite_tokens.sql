REVOKE SELECT ON public.workspace_invitations FROM authenticated;
GRANT SELECT (id, workspace_id, email, full_name, role, status, invited_by, sent_at, expires_at, accepted_at, accepted_user_id, created_at) ON public.workspace_invitations TO authenticated;
REVOKE SELECT ON public.agency_employee_invitations FROM authenticated;
GRANT SELECT (id, agency_user_id, email, full_name, role, client_access, client_ids, status, sent_at, accepted_at, accepted_user_id, link_opened_count, link_last_opened_at, created_at, updated_at, expires_at) ON public.agency_employee_invitations TO authenticated;