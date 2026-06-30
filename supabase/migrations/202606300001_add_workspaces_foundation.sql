create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  source_clinic_id uuid references public.clinics(id) on delete set null,
  name text not null,
  email text,
  phone text,
  address text,
  responsible_name text,
  color text not null default '#0b97dc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspaces_type_check check (type in ('PERSONAL', 'CLINICA')),
  constraint workspaces_clinic_source_check check (
    (type = 'PERSONAL' and source_clinic_id is null)
    or (type = 'CLINICA' and source_clinic_id is not null)
  )
);

create unique index if not exists workspaces_personal_owner_uidx
  on public.workspaces(owner_id)
  where type = 'PERSONAL';

create unique index if not exists workspaces_source_clinic_uidx
  on public.workspaces(source_clinic_id)
  where source_clinic_id is not null;

create index if not exists workspaces_owner_id_idx on public.workspaces(owner_id);
create index if not exists workspaces_type_idx on public.workspaces(type);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  email text not null,
  role text not null default 'KINESIOLOGO',
  status text not null default 'pending',
  invited_by uuid references public.profiles(id) on delete set null,
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  color text not null default '#14b8a6',
  can_register_evolutions boolean not null default true,
  can_view_assigned_patients boolean not null default true,
  source_clinic_professional_id uuid references public.clinic_professionals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_members_role_check check (role in ('ADMIN', 'KINESIOLOGO')),
  constraint workspace_members_status_check check (
    status in ('pending', 'accepted', 'rejected', 'inactive')
  ),
  constraint workspace_members_email_check check (email = lower(trim(email))),
  constraint workspace_members_admin_user_check check (
    role <> 'ADMIN' or user_id is not null
  )
);

create index if not exists workspace_members_workspace_id_idx
  on public.workspace_members(workspace_id);
create index if not exists workspace_members_user_id_idx
  on public.workspace_members(user_id);
create index if not exists workspace_members_email_idx
  on public.workspace_members(email);
create unique index if not exists workspace_members_active_email_uidx
  on public.workspace_members(workspace_id, email)
  where status in ('pending', 'accepted');
create unique index if not exists workspace_members_active_user_uidx
  on public.workspace_members(workspace_id, user_id)
  where user_id is not null
    and status in ('pending', 'accepted');

create table if not exists public.patient_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_assignments_dates_check check (
    ended_at is null or ended_at >= assigned_at
  )
);

create index if not exists patient_assignments_workspace_id_idx
  on public.patient_assignments(workspace_id);
create index if not exists patient_assignments_patient_id_idx
  on public.patient_assignments(patient_id);
create index if not exists patient_assignments_professional_id_idx
  on public.patient_assignments(professional_id);
create unique index if not exists patient_assignments_active_uidx
  on public.patient_assignments(workspace_id, patient_id, professional_id)
  where ended_at is null;

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

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at
before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists set_workspace_members_updated_at on public.workspace_members;
create trigger set_workspace_members_updated_at
before update on public.workspace_members
for each row execute function public.set_updated_at();

drop trigger if exists set_patient_assignments_updated_at on public.patient_assignments;
create trigger set_patient_assignments_updated_at
before update on public.patient_assignments
for each row execute function public.set_updated_at();

insert into public.workspaces (
  type,
  owner_id,
  name,
  email,
  phone,
  responsible_name,
  color,
  created_at,
  updated_at
)
select
  'PERSONAL',
  profiles.id,
  coalesce(nullif(profiles.full_name, ''), 'Mi espacio'),
  lower(profiles.email),
  profiles.phone,
  profiles.full_name,
  '#0b97dc',
  profiles.created_at,
  now()
from public.profiles
on conflict do nothing;

insert into public.workspaces (
  type,
  owner_id,
  source_clinic_id,
  name,
  email,
  phone,
  address,
  responsible_name,
  color,
  created_at,
  updated_at
)
select
  'CLINICA',
  clinics.owner_id,
  clinics.id,
  clinics.name,
  lower(clinics.email),
  clinics.phone,
  clinics.address,
  clinics.responsible_name,
  clinics.color,
  clinics.created_at,
  now()
from public.clinics
on conflict do nothing;

insert into public.workspace_members (
  workspace_id,
  user_id,
  email,
  role,
  status,
  invited_by,
  invited_at,
  responded_at,
  color,
  can_register_evolutions,
  can_view_assigned_patients,
  created_at,
  updated_at
)
select
  workspaces.id,
  profiles.id,
  lower(coalesce(profiles.email, auth_users.email)),
  'ADMIN',
  'accepted',
  profiles.id,
  profiles.created_at,
  profiles.created_at,
  '#0b97dc',
  true,
  true,
  profiles.created_at,
  now()
from public.workspaces
join public.profiles on profiles.id = workspaces.owner_id
left join auth.users auth_users on auth_users.id = profiles.id
where lower(coalesce(profiles.email, auth_users.email)) is not null
on conflict do nothing;

insert into public.workspace_members (
  workspace_id,
  user_id,
  email,
  role,
  status,
  invited_by,
  invited_at,
  responded_at,
  color,
  can_register_evolutions,
  can_view_assigned_patients,
  source_clinic_professional_id,
  created_at,
  updated_at
)
select
  workspaces.id,
  clinic_professionals.professional_id,
  lower(trim(clinic_professionals.professional_email)),
  case
    when upper(clinic_professionals.role) = 'ADMIN' then 'ADMIN'
    else 'KINESIOLOGO'
  end,
  clinic_professionals.status,
  clinics.owner_id,
  clinic_professionals.invited_at,
  clinic_professionals.responded_at,
  clinic_professionals.color,
  clinic_professionals.can_register_evolutions,
  clinic_professionals.can_view_assigned_patients,
  clinic_professionals.id,
  clinic_professionals.created_at,
  now()
from public.clinic_professionals
join public.clinics on clinics.id = clinic_professionals.clinic_id
join public.workspaces
  on workspaces.source_clinic_id = clinic_professionals.clinic_id
where lower(trim(clinic_professionals.professional_email)) is not null
on conflict do nothing;

update public.patients
set workspace_id = workspaces.id
from public.workspaces
where patients.workspace_id is null
  and patients.clinic_id is not null
  and workspaces.source_clinic_id = patients.clinic_id;

update public.patients
set workspace_id = workspaces.id
from public.workspaces
where patients.workspace_id is null
  and patients.clinic_id is null
  and workspaces.type = 'PERSONAL'
  and workspaces.owner_id = patients.owner_id;

update public.appointments
set workspace_id = workspaces.id
from public.workspaces
where appointments.workspace_id is null
  and appointments.clinic_id is not null
  and workspaces.source_clinic_id = appointments.clinic_id;

update public.appointments
set workspace_id = patients.workspace_id
from public.patients
where appointments.workspace_id is null
  and patients.id = appointments.patient_id
  and patients.workspace_id is not null;

update public.appointments
set workspace_id = workspaces.id
from public.workspaces
where appointments.workspace_id is null
  and appointments.clinic_id is null
  and workspaces.type = 'PERSONAL'
  and workspaces.owner_id = appointments.owner_id;

update public.evolutions
set workspace_id = appointments.workspace_id
from public.appointments
where evolutions.workspace_id is null
  and appointments.id = evolutions.appointment_id
  and appointments.workspace_id is not null;

update public.evolutions
set workspace_id = patients.workspace_id
from public.patients
where evolutions.workspace_id is null
  and patients.id = evolutions.patient_id
  and patients.workspace_id is not null;

update public.evolutions
set workspace_id = workspaces.id
from public.workspaces
where evolutions.workspace_id is null
  and workspaces.type = 'PERSONAL'
  and workspaces.owner_id = evolutions.owner_id;

update public.treatments
set workspace_id = patients.workspace_id
from public.patients
where treatments.workspace_id is null
  and patients.id = treatments.patient_id
  and patients.workspace_id is not null;

update public.treatments
set workspace_id = workspaces.id
from public.workspaces
where treatments.workspace_id is null
  and workspaces.type = 'PERSONAL'
  and workspaces.owner_id = treatments.owner_id;

update public.subscriptions
set workspace_id = personal_workspaces.id
from public.workspaces personal_workspaces
where subscriptions.workspace_id is null
  and subscriptions.account_type = 'KINESIOLOGO'
  and personal_workspaces.type = 'PERSONAL'
  and personal_workspaces.owner_id = subscriptions.account_id;

update public.subscriptions
set workspace_id = (
  select workspaces.id
  from public.workspaces
  where workspaces.type = 'CLINICA'
    and workspaces.owner_id = subscriptions.account_id
  order by workspaces.created_at
  limit 1
)
where subscriptions.workspace_id is null
  and subscriptions.account_type = 'CONSULTORIO';

update public.subscriptions
set workspace_id = personal_workspaces.id
from public.workspaces personal_workspaces
where subscriptions.workspace_id is null
  and personal_workspaces.type = 'PERSONAL'
  and personal_workspaces.owner_id = subscriptions.account_id;

insert into public.patient_assignments (
  workspace_id,
  patient_id,
  professional_id,
  assigned_by,
  assigned_at,
  created_at,
  updated_at
)
select distinct
  appointments.workspace_id,
  appointments.patient_id,
  appointments.owner_id,
  coalesce(clinics.owner_id, appointments.owner_id),
  min(appointments.created_at) over (
    partition by appointments.workspace_id, appointments.patient_id, appointments.owner_id
  ),
  min(appointments.created_at) over (
    partition by appointments.workspace_id, appointments.patient_id, appointments.owner_id
  ),
  now()
from public.appointments
left join public.clinics on clinics.id = appointments.clinic_id
where appointments.workspace_id is not null
  and appointments.appointment_origin = 'clinic'
  and appointments.owner_id is not null
on conflict do nothing;

insert into public.patient_assignments (
  workspace_id,
  patient_id,
  professional_id,
  assigned_by,
  assigned_at,
  created_at,
  updated_at
)
select
  patients.workspace_id,
  patients.id,
  patients.owner_id,
  patients.owner_id,
  patients.created_at,
  patients.created_at,
  now()
from public.patients
join public.workspaces on workspaces.id = patients.workspace_id
where workspaces.type = 'PERSONAL'
  and patients.owner_id is not null
on conflict do nothing;

create or replace function public.get_personal_workspace_id(target_user_id uuid)
returns uuid
stable
language sql
security definer
set search_path = public
as $function$
  select workspaces.id
  from public.workspaces
  where workspaces.type = 'PERSONAL'
    and workspaces.owner_id = target_user_id
  order by workspaces.created_at
  limit 1;
$function$;

create or replace function public.get_clinic_workspace_id(target_clinic_id uuid)
returns uuid
stable
language sql
security definer
set search_path = public
as $function$
  select workspaces.id
  from public.workspaces
  where workspaces.source_clinic_id = target_clinic_id
  limit 1;
$function$;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = target_workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.status = 'accepted'
  );
$function$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = target_workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.role = 'ADMIN'
      and workspace_members.status = 'accepted'
  );
$function$;

create or replace function public.is_patient_assigned_to_user(target_patient_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patient_assignments
    join public.patients on patients.id = patient_assignments.patient_id
    where patient_assignments.patient_id = target_patient_id
      and patient_assignments.professional_id = auth.uid()
      and patient_assignments.ended_at is null
      and patient_assignments.workspace_id = patients.workspace_id
  );
$function$;

create or replace function public.can_access_workspace_patient(target_patient_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    where patients.id = target_patient_id
      and (
        public.is_workspace_admin(patients.workspace_id)
        or public.is_patient_assigned_to_user(patients.id)
      )
  );
$function$;

create or replace function public.can_manage_workspace_patient(target_patient_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    where patients.id = target_patient_id
      and public.is_workspace_admin(patients.workspace_id)
  );
$function$;

create or replace function public.get_workspace_patient_limit(target_workspace_id uuid)
returns integer
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  patient_limit integer;
begin
  select plans.max_patients
    into patient_limit
  from public.subscriptions
  join public.plans on plans.id = subscriptions.plan_id
  where subscriptions.workspace_id = target_workspace_id
    and subscriptions.status = 'ACTIVE'
  order by subscriptions.created_at desc
  limit 1;

  if patient_limit is not null then
    return patient_limit;
  end if;

  select plans.max_patients
    into patient_limit
  from public.plans
  where plans.code = 'FREE'
  limit 1;

  return coalesce(patient_limit, 5);
end;
$function$;

create or replace function public.get_workspace_patient_limit_block_message(target_workspace_id uuid)
returns text
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  patient_limit integer;
  active_patients integer;
begin
  patient_limit := public.get_workspace_patient_limit(target_workspace_id);

  if patient_limit is null or patient_limit < 0 then
    return null;
  end if;

  select count(*)
    into active_patients
  from public.patients
  where patients.workspace_id = target_workspace_id
    and patients.status = 'active';

  if active_patients >= patient_limit then
    return format(
      'Tu plan Free permite hasta %s pacientes activos por espacio de trabajo. Tenes %s pacientes activos.',
      patient_limit,
      active_patients
    );
  end if;

  return null;
end;
$function$;

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

drop trigger if exists ensure_profile_personal_workspace on public.profiles;
create trigger ensure_profile_personal_workspace
after insert on public.profiles
for each row execute function public.ensure_profile_personal_workspace();

create or replace function public.ensure_clinic_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_workspace_id uuid;
  owner_email text;
begin
  insert into public.workspaces (
    type,
    owner_id,
    source_clinic_id,
    name,
    email,
    phone,
    address,
    responsible_name,
    color
  )
  values (
    'CLINICA',
    new.owner_id,
    new.id,
    new.name,
    lower(new.email),
    new.phone,
    new.address,
    new.responsible_name,
    new.color
  )
  on conflict do nothing;

  update public.workspaces
  set
    owner_id = new.owner_id,
    name = new.name,
    email = lower(new.email),
    phone = new.phone,
    address = new.address,
    responsible_name = new.responsible_name,
    color = new.color,
    updated_at = now()
  where source_clinic_id = new.id;

  select workspaces.id
    into target_workspace_id
  from public.workspaces
  where workspaces.source_clinic_id = new.id
  limit 1;

  select lower(profiles.email)
    into owner_email
  from public.profiles
  where profiles.id = new.owner_id;

  if target_workspace_id is not null and owner_email is not null then
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
      new.owner_id,
      owner_email,
      'ADMIN',
      'accepted',
      new.owner_id,
      now(),
      coalesce(new.color, '#0b97dc')
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$;

drop trigger if exists ensure_clinic_workspace on public.clinics;
create trigger ensure_clinic_workspace
after insert or update of owner_id, name, email, phone, address, responsible_name, color
on public.clinics
for each row execute function public.ensure_clinic_workspace();

create or replace function public.sync_clinic_professional_workspace_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_workspace_id uuid;
  clinic_owner_id uuid;
begin
  select workspaces.id, clinics.owner_id
    into target_workspace_id, clinic_owner_id
  from public.clinics
  join public.workspaces on workspaces.source_clinic_id = clinics.id
  where clinics.id = new.clinic_id
  limit 1;

  if target_workspace_id is null then
    return new;
  end if;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    email,
    role,
    status,
    invited_by,
    invited_at,
    responded_at,
    color,
    can_register_evolutions,
    can_view_assigned_patients,
    source_clinic_professional_id
  )
  values (
    target_workspace_id,
    new.professional_id,
    lower(trim(new.professional_email)),
    case when upper(new.role) = 'ADMIN' then 'ADMIN' else 'KINESIOLOGO' end,
    new.status,
    clinic_owner_id,
    new.invited_at,
    new.responded_at,
    new.color,
    new.can_register_evolutions,
    new.can_view_assigned_patients,
    new.id
  )
  on conflict do nothing;

  update public.workspace_members
  set
    user_id = new.professional_id,
    role = case when upper(new.role) = 'ADMIN' then 'ADMIN' else 'KINESIOLOGO' end,
    status = new.status,
    responded_at = new.responded_at,
    color = new.color,
    can_register_evolutions = new.can_register_evolutions,
    can_view_assigned_patients = new.can_view_assigned_patients,
    source_clinic_professional_id = new.id,
    updated_at = now()
  where workspace_id = target_workspace_id
    and email = lower(trim(new.professional_email));

  return new;
end;
$function$;

drop trigger if exists sync_clinic_professional_workspace_member
on public.clinic_professionals;
create trigger sync_clinic_professional_workspace_member
after insert or update of professional_id, professional_email, status, responded_at, color, role, can_register_evolutions, can_view_assigned_patients
on public.clinic_professionals
for each row execute function public.sync_clinic_professional_workspace_member();

create or replace function public.can_access_patient(target_patient_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    where patients.id = target_patient_id
      and patients.owner_id = auth.uid()
  )
  or public.can_access_workspace_patient(target_patient_id)
  or exists (
    select 1
    from public.appointments
    join public.clinic_professionals
      on clinic_professionals.id = appointments.clinic_professional_id
    where appointments.patient_id = target_patient_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
  );
$function$;

create or replace function public.set_record_workspace_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_table_name = 'patients' then
    if new.workspace_id is null and new.clinic_id is not null then
      new.workspace_id := public.get_clinic_workspace_id(new.clinic_id);
    end if;

    if new.workspace_id is null then
      new.workspace_id := public.get_personal_workspace_id(new.owner_id);
    end if;
  elsif tg_table_name = 'appointments' then
    if new.workspace_id is null and new.clinic_id is not null then
      new.workspace_id := public.get_clinic_workspace_id(new.clinic_id);
    end if;

    if new.workspace_id is null then
      select patients.workspace_id
        into new.workspace_id
      from public.patients
      where patients.id = new.patient_id;
    end if;

    if new.workspace_id is null then
      new.workspace_id := public.get_personal_workspace_id(new.owner_id);
    end if;
  elsif tg_table_name = 'evolutions' then
    if new.workspace_id is null and new.appointment_id is not null then
      select appointments.workspace_id
        into new.workspace_id
      from public.appointments
      where appointments.id = new.appointment_id;
    end if;

    if new.workspace_id is null then
      select patients.workspace_id
        into new.workspace_id
      from public.patients
      where patients.id = new.patient_id;
    end if;

    if new.workspace_id is null then
      new.workspace_id := public.get_personal_workspace_id(new.owner_id);
    end if;
  elsif tg_table_name = 'treatments' then
    if new.workspace_id is null then
      select patients.workspace_id
        into new.workspace_id
      from public.patients
      where patients.id = new.patient_id;
    end if;

    if new.workspace_id is null then
      new.workspace_id := public.get_personal_workspace_id(new.owner_id);
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists set_patients_workspace_id on public.patients;
create trigger set_patients_workspace_id
before insert or update of owner_id, clinic_id, workspace_id
on public.patients
for each row execute function public.set_record_workspace_id();

drop trigger if exists set_appointments_workspace_id on public.appointments;
create trigger set_appointments_workspace_id
before insert or update of owner_id, patient_id, clinic_id, workspace_id
on public.appointments
for each row execute function public.set_record_workspace_id();

drop trigger if exists set_evolutions_workspace_id on public.evolutions;
create trigger set_evolutions_workspace_id
before insert or update of owner_id, patient_id, appointment_id, workspace_id
on public.evolutions
for each row execute function public.set_record_workspace_id();

drop trigger if exists set_treatments_workspace_id on public.treatments;
create trigger set_treatments_workspace_id
before insert or update of owner_id, patient_id, workspace_id
on public.treatments
for each row execute function public.set_record_workspace_id();

create or replace function public.validate_patient_assignment_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not exists (
    select 1
    from public.patients
    where patients.id = new.patient_id
      and patients.workspace_id = new.workspace_id
  ) then
    raise exception 'La asignacion debe pertenecer al mismo espacio de trabajo que el paciente.';
  end if;

  if not exists (
    select 1
    from public.workspace_members
    where workspace_members.workspace_id = new.workspace_id
      and workspace_members.user_id = new.professional_id
      and workspace_members.role = 'KINESIOLOGO'
      and workspace_members.status = 'accepted'
  )
  and not exists (
    select 1
    from public.workspaces
    where workspaces.id = new.workspace_id
      and workspaces.type = 'PERSONAL'
      and workspaces.owner_id = new.professional_id
  ) then
    raise exception 'El profesional debe pertenecer al espacio de trabajo.';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_patient_assignment_workspace on public.patient_assignments;
create trigger validate_patient_assignment_workspace
before insert or update of workspace_id, patient_id, professional_id
on public.patient_assignments
for each row execute function public.validate_patient_assignment_workspace();

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.patient_assignments enable row level security;

alter table public.workspaces force row level security;
alter table public.workspace_members force row level security;
alter table public.patient_assignments force row level security;

drop policy if exists "Members can read their workspaces" on public.workspaces;
create policy "Members can read their workspaces"
on public.workspaces for select
to authenticated
using (public.is_workspace_member(id));

drop policy if exists "Users can create personal workspace" on public.workspaces;
create policy "Users can create personal workspace"
on public.workspaces for insert
to authenticated
with check (
  type = 'PERSONAL'
  and owner_id = auth.uid()
);

drop policy if exists "Admins can update workspaces" on public.workspaces;
create policy "Admins can update workspaces"
on public.workspaces for update
to authenticated
using (public.is_workspace_admin(id))
with check (public.is_workspace_admin(id));

drop policy if exists "Members can read workspace members" on public.workspace_members;
create policy "Members can read workspace members"
on public.workspace_members for select
to authenticated
using (
  public.is_workspace_member(workspace_id)
  or (
    user_id is null
    and email = public.current_user_email()
  )
);

drop policy if exists "Admins can manage workspace members" on public.workspace_members;
create policy "Admins can manage workspace members"
on public.workspace_members for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists "Professionals can answer workspace invitations" on public.workspace_members;
create policy "Professionals can answer workspace invitations"
on public.workspace_members for update
to authenticated
using (
  status = 'pending'
  and (
    user_id = auth.uid()
    or (
      user_id is null
      and email = public.current_user_email()
    )
  )
)
with check (
  user_id = auth.uid()
  and status in ('accepted', 'rejected')
);

drop policy if exists "Admins can manage patient assignments" on public.patient_assignments;
create policy "Admins can manage patient assignments"
on public.patient_assignments for all
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists "Assigned professionals can read patient assignments" on public.patient_assignments;
create policy "Assigned professionals can read patient assignments"
on public.patient_assignments for select
to authenticated
using (
  professional_id = auth.uid()
  and ended_at is null
);
