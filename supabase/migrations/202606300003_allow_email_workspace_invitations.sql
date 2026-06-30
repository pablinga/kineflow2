drop policy if exists "Clinics can search kinesiologists" on public.profiles;
create policy "Clinics can search kinesiologists"
on public.profiles for select
to authenticated
using (
  account_type = 'KINESIOLOGO'
  and (
    public.current_account_type() = 'CONSULTORIO'
    or exists (
      select 1
      from public.workspace_members
      join public.workspaces on workspaces.id = workspace_members.workspace_id
      where workspace_members.user_id = auth.uid()
        and workspace_members.role = 'ADMIN'
        and workspace_members.status = 'accepted'
        and workspaces.type = 'CLINICA'
    )
  )
);

drop policy if exists "Clinic owners can manage professional links" on public.clinic_professionals;
create policy "Clinic owners can manage professional links"
on public.clinic_professionals for all
to authenticated
using (
  public.is_clinic_owner(clinic_id)
  or public.is_workspace_admin(public.get_clinic_workspace_id(clinic_id))
)
with check (
  (
    public.is_clinic_owner(clinic_id)
    or public.is_workspace_admin(public.get_clinic_workspace_id(clinic_id))
  )
  and professional_email = lower(trim(professional_email))
  and (
    professional_id is null
    or exists (
      select 1
      from public.profiles
      where profiles.id = professional_id
        and profiles.account_type = 'KINESIOLOGO'
        and profiles.email = professional_email
    )
  )
);

drop policy if exists "Professionals can read their invitations" on public.clinic_professionals;
create policy "Professionals can read their invitations"
on public.clinic_professionals for select
to authenticated
using (
  (
    professional_id = auth.uid()
    and public.current_account_type() = 'KINESIOLOGO'
  )
  or (
    professional_id is null
    and professional_email = public.current_user_email()
  )
);

drop policy if exists "Professionals can answer invitations" on public.clinic_professionals;
create policy "Professionals can answer invitations"
on public.clinic_professionals for update
to authenticated
using (
  status = 'pending'
  and public.current_account_type() = 'KINESIOLOGO'
  and (
    professional_id = auth.uid()
    or (
      professional_id is null
      and professional_email = public.current_user_email()
    )
  )
)
with check (
  professional_id = auth.uid()
  and status in ('accepted', 'rejected')
  and public.current_account_type() = 'KINESIOLOGO'
);
