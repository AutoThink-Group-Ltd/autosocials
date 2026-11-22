-- Accepting a team invitation and granting access are one transaction. The service
-- calls this only after verifying the signed-in identity or creating the invited user.
create function public.accept_agency_team_invitation(_token text, _user_id uuid, _full_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.agency_employee_invitations%rowtype; existing uuid; account_email text;
begin
  select * into i from public.agency_employee_invitations where token = _token for update;
  if not found or i.status <> 'pending' or i.expires_at is null or i.expires_at <= now() then
    raise exception 'Invitation expired or already used';
  end if;
  select email into account_email from auth.users where id = _user_id;
  if account_email is null or lower(account_email) <> lower(i.email) then raise exception 'Invitation email mismatch'; end if;
  if exists(select 1 from public.agency_profiles where user_id = _user_id and user_id <> i.agency_user_id)
     or exists(select 1 from public.agency_employees where employee_user_id = _user_id and agency_user_id <> i.agency_user_id and is_active) then
    raise exception 'Account already belongs to another agency';
  end if;
  select id into existing from public.agency_employees where agency_user_id=i.agency_user_id and employee_user_id=_user_id order by created_at limit 1;
  if existing is null then
    insert into public.agency_employees(agency_user_id,employee_user_id,invitation_id,email,full_name,role,client_access,client_ids,is_active)
    values(i.agency_user_id,_user_id,i.id,i.email,coalesce(nullif(_full_name,''),i.full_name),case when i.role='admin' then 'admin' else 'member' end,i.client_access,i.client_ids,true);
  else
    update public.agency_employees set invitation_id=i.id,email=i.email,full_name=coalesce(nullif(_full_name,''),i.full_name),
      role=case when i.role='admin' then 'admin' else 'member' end,client_access=i.client_access,client_ids=i.client_ids,is_active=true,updated_at=now() where id=existing;
  end if;
  update public.profiles set account_type='agency' where id=_user_id;
  if not found then raise exception 'Account profile is not ready'; end if;
  update public.agency_employee_invitations set status='accepted',accepted_at=now(),accepted_user_id=_user_id,updated_at=now() where id=i.id;
end $$;
revoke all on function public.accept_agency_team_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function public.accept_agency_team_invitation(text, uuid, text) to service_role;
