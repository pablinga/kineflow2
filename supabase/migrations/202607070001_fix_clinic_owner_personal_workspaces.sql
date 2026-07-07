create or replace function public.ensure_profile_personal_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_workspace_id uuid;
  target_email text;
begin
  if coalesce(new.account_type, 'KINESIOLOGO') <> 'KINESIOLOGO' then
    return new;
  end if;

  target_email := lower(coalesce(new.email, (
    select auth_users.email
    from auth.users auth_users
    where auth_users.id = new.id
  )));

  insert into public.workspaces (
    type,
    owner_id,
    name,
    email,
    phone,
    responsible_name,
    color
  )
  values (
    'PERSONAL',
    new.id,
    coalesce(nullif(new.full_name, ''), 'Mi espacio'),
    target_email,
    new.phone,
    new.full_name,
    '#0b97dc'
  )
  on conflict do nothing;

  select workspaces.id
    into target_workspace_id
  from public.workspaces
  where workspaces.type = 'PERSONAL'
    and workspaces.owner_id = new.id
  limit 1;

  if target_workspace_id is not null and target_email is not null then
    insert into public.workspace_members (
      workspace_id,
      user_id,
      email,
      role,
      status,
      invited_by,
      responded_at,
      color
    )
    values (
      target_workspace_id,
      new.id,
      target_email,
      'ADMIN',
      'accepted',
      new.id,
      now(),
      '#0b97dc'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

drop policy if exists "Users can create personal workspace" on public.workspaces;
create policy "Users can create personal workspace"
on public.workspaces for insert
to authenticated
with check (
  type = 'PERSONAL'
  and owner_id = auth.uid()
  and exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.account_type = 'KINESIOLOGO'
  )
);

with empty_clinic_personal_workspaces as (
  select workspaces.id
  from public.workspaces
  join public.profiles on profiles.id = workspaces.owner_id
  where workspaces.type = 'PERSONAL'
    and profiles.account_type = 'CONSULTORIO'
    and not exists (
      select 1
      from public.patients
      where patients.workspace_id = workspaces.id
    )
    and not exists (
      select 1
      from public.appointments
      where appointments.workspace_id = workspaces.id
    )
    and not exists (
      select 1
      from public.evolutions
      where evolutions.workspace_id = workspaces.id
    )
    and not exists (
      select 1
      from public.treatments
      where treatments.workspace_id = workspaces.id
    )
    and not exists (
      select 1
      from public.subscriptions
      where subscriptions.workspace_id = workspaces.id
    )
    and not exists (
      select 1
      from public.workspace_members
      where workspace_members.workspace_id = workspaces.id
        and (
          workspace_members.user_id is distinct from workspaces.owner_id
          or workspace_members.role <> 'ADMIN'
          or workspace_members.status <> 'accepted'
        )
    )
)
delete from public.workspaces
using empty_clinic_personal_workspaces
where workspaces.id = empty_clinic_personal_workspaces.id;
