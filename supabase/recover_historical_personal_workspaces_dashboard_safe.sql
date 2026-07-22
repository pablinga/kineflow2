alter table public.patients
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table public.appointments
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table public.evolutions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table public.treatments
  add column if not exists workspace_id uuid references public.workspaces(id) on delete restrict;

alter table public.subscriptions
  add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;

create index if not exists patients_workspace_id_idx on public.patients(workspace_id);
create index if not exists appointments_workspace_id_idx on public.appointments(workspace_id);
create index if not exists evolutions_workspace_id_idx on public.evolutions(workspace_id);
create index if not exists treatments_workspace_id_idx on public.treatments(workspace_id);
create index if not exists subscriptions_workspace_id_idx on public.subscriptions(workspace_id);

create or replace function public.ensure_kinesiologist_personal_workspace(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $kineflow_workspace_recovery$
declare
  profile_row public.profiles%rowtype;
  personal_workspace_id uuid;
  profile_email text;
begin
  if target_user_id is null then
    raise exception 'Falta el usuario para recuperar el workspace personal.';
  end if;

  if auth.uid() is not null and auth.uid() <> target_user_id then
    raise exception 'No tenes permisos para recuperar este workspace.';
  end if;

  perform pg_advisory_xact_lock(hashtext(target_user_id::text)::bigint);

  select *
    into profile_row
  from public.profiles
  where profiles.id = target_user_id;

  if not found then
    raise exception 'No encontramos el perfil del usuario.';
  end if;

  if coalesce(profile_row.account_type, 'KINESIOLOGO') <> 'KINESIOLOGO' then
    return null;
  end if;

  profile_email := lower(coalesce(profile_row.email, (
    select auth_users.email
    from auth.users auth_users
    where auth_users.id = target_user_id
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
    target_user_id,
    coalesce(nullif(profile_row.full_name, ''), 'Mi espacio'),
    profile_email,
    profile_row.phone,
    profile_row.full_name,
    '#0b97dc'
  )
  on conflict do nothing;

  select workspaces.id
    into personal_workspace_id
  from public.workspaces
  where workspaces.type = 'PERSONAL'
    and workspaces.owner_id = target_user_id
  order by workspaces.created_at
  limit 1;

  if personal_workspace_id is null then
    raise exception 'No pudimos crear el workspace personal.';
  end if;

  if profile_email is not null then
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
      personal_workspace_id,
      target_user_id,
      profile_email,
      'ADMIN',
      'accepted',
      target_user_id,
      now(),
      '#0b97dc'
    )
    on conflict do nothing;
  end if;

  update public.patients
  set workspace_id = personal_workspace_id
  where patients.workspace_id is null
    and patients.owner_id = target_user_id
    and patients.clinic_id is null;

  update public.appointments
  set workspace_id = patients.workspace_id
  from public.patients
  where appointments.workspace_id is null
    and appointments.patient_id = patients.id
    and appointments.owner_id = target_user_id
    and appointments.clinic_id is null
    and patients.workspace_id is not null;

  update public.appointments
  set workspace_id = personal_workspace_id
  where appointments.workspace_id is null
    and appointments.owner_id = target_user_id
    and appointments.clinic_id is null;

  update public.evolutions
  set workspace_id = appointments.workspace_id
  from public.appointments
  where evolutions.workspace_id is null
    and evolutions.appointment_id = appointments.id
    and evolutions.owner_id = target_user_id
    and appointments.workspace_id is not null;

  update public.evolutions
  set workspace_id = patients.workspace_id
  from public.patients
  where evolutions.workspace_id is null
    and evolutions.patient_id = patients.id
    and evolutions.owner_id = target_user_id
    and patients.workspace_id is not null;

  update public.evolutions
  set workspace_id = personal_workspace_id
  where evolutions.workspace_id is null
    and evolutions.owner_id = target_user_id;

  update public.treatments
  set workspace_id = patients.workspace_id
  from public.patients
  where treatments.workspace_id is null
    and treatments.patient_id = patients.id
    and treatments.owner_id = target_user_id
    and patients.workspace_id is not null;

  update public.treatments
  set workspace_id = personal_workspace_id
  where treatments.workspace_id is null
    and treatments.owner_id = target_user_id;

  update public.subscriptions
  set workspace_id = personal_workspace_id
  where subscriptions.workspace_id is null
    and subscriptions.account_id = target_user_id
    and subscriptions.account_type = 'KINESIOLOGO';

  return personal_workspace_id;
end;
$kineflow_workspace_recovery$;

create or replace function public.ensure_profile_personal_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $kineflow_profile_workspace$
begin
  perform public.ensure_kinesiologist_personal_workspace(new.id);
  return new;
end;
$kineflow_profile_workspace$;

select public.ensure_kinesiologist_personal_workspace(profiles.id)
from public.profiles
where profiles.account_type = 'KINESIOLOGO'
  and not exists (
    select 1
    from public.workspaces
    where workspaces.type = 'PERSONAL'
      and workspaces.owner_id = profiles.id
  );

select public.ensure_kinesiologist_personal_workspace(profiles.id)
from public.profiles
where profiles.account_type = 'KINESIOLOGO'
  and exists (
    select 1
    from public.workspaces
    where workspaces.type = 'PERSONAL'
      and workspaces.owner_id = profiles.id
  )
  and not exists (
    select 1
    from public.workspace_members
    join public.workspaces on workspaces.id = workspace_members.workspace_id
    where workspaces.type = 'PERSONAL'
      and workspaces.owner_id = profiles.id
      and workspace_members.user_id = profiles.id
      and workspace_members.role = 'ADMIN'
      and workspace_members.status = 'accepted'
  );
