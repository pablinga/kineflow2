alter table public.profiles
  add column if not exists account_type text not null default 'KINESIOLOGO',
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists specialty text,
  add column if not exists organization_name text,
  add column if not exists organization_address text,
  add column if not exists responsible_name text;

alter table public.profiles
  drop constraint if exists profiles_account_type_check,
  add constraint profiles_account_type_check check (
    account_type in ('KINESIOLOGO', 'CONSULTORIO')
  );

update public.profiles
set account_type = case
  when role in ('clinic', 'consultorio', 'CONSULTORIO') then 'CONSULTORIO'
  else 'KINESIOLOGO'
end
where account_type is null
   or account_type not in ('KINESIOLOGO', 'CONSULTORIO');

update public.profiles
set email = auth_users.email
from auth.users auth_users
where profiles.id = auth_users.id
  and profiles.email is null;

update public.profiles
set license_number = null
where account_type = 'CONSULTORIO';

alter table public.clinics
  add column if not exists responsible_name text;

create or replace function public.handle_new_user()
returns trigger
as $function$
declare
  new_account_type text;
  organization_name text;
begin
  new_account_type := coalesce(
    new.raw_user_meta_data->>'account_type',
    new.raw_user_meta_data->>'accountType',
    'KINESIOLOGO'
  );

  if new_account_type not in ('KINESIOLOGO', 'CONSULTORIO') then
    new_account_type := 'KINESIOLOGO';
  end if;

  organization_name := coalesce(
    nullif(new.raw_user_meta_data->>'organization_name', ''),
    nullif(new.raw_user_meta_data->>'clinic_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    'Consultorio'
  );

  insert into public.profiles (
    id,
    account_type,
    email,
    full_name,
    license_number,
    phone,
    specialty,
    organization_name,
    organization_address,
    responsible_name,
    role
  )
  values (
    new.id,
    new_account_type,
    lower(new.email),
    case
      when new_account_type = 'CONSULTORIO' then organization_name
      else coalesce(new.raw_user_meta_data->>'full_name', 'Kinesiologo')
    end,
    case
      when new_account_type = 'KINESIOLOGO' then new.raw_user_meta_data->>'license_number'
      else null
    end,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',
    case when new_account_type = 'CONSULTORIO' then organization_name else null end,
    case
      when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'organization_address'
      else null
    end,
    case
      when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'responsible_name'
      else null
    end,
    case
      when new_account_type = 'CONSULTORIO' then 'clinic'
      else 'kinesiologist'
    end
  )
  on conflict (id) do update
  set
    account_type = excluded.account_type,
    email = excluded.email,
    full_name = excluded.full_name,
    license_number = excluded.license_number,
    phone = excluded.phone,
    specialty = excluded.specialty,
    organization_name = excluded.organization_name,
    organization_address = excluded.organization_address,
    responsible_name = excluded.responsible_name,
    role = excluded.role,
    updated_at = now();

  if new_account_type = 'CONSULTORIO' then
    insert into public.clinics (
      owner_id,
      name,
      email,
      phone,
      address,
      responsible_name
    )
    values (
      new.id,
      organization_name,
      lower(new.email),
      new.raw_user_meta_data->>'phone',
      new.raw_user_meta_data->>'organization_address',
      new.raw_user_meta_data->>'responsible_name'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$function$ language plpgsql security definer set search_path = public;

create or replace function public.current_account_type()
returns text
stable
language sql
security definer
set search_path = public
as $function$
  select profiles.account_type
  from public.profiles
  where profiles.id = auth.uid();
$function$;

create or replace function public.is_clinic_owner(target_clinic_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.clinics
    join public.profiles on profiles.id = clinics.owner_id
    where clinics.id = target_clinic_id
      and clinics.owner_id = auth.uid()
      and profiles.account_type = 'CONSULTORIO'
  );
$function$;

create or replace function public.is_accepted_clinic_professional(target_clinic_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.clinic_professionals
    join public.profiles on profiles.id = clinic_professionals.professional_id
    where clinic_professionals.clinic_id = target_clinic_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
      and profiles.account_type = 'KINESIOLOGO'
  );
$function$;

create unique index if not exists clinic_professionals_unique_active_professional_idx
  on public.clinic_professionals(clinic_id, professional_id)
  where professional_id is not null
    and status in ('pending', 'accepted');

alter table public.clinic_professionals
  drop constraint if exists clinic_professionals_professional_profile_fk,
  add constraint clinic_professionals_professional_profile_fk
  foreign key (professional_id) references public.profiles(id) on delete set null;

drop policy if exists "Clinics can search kinesiologists" on public.profiles;
create policy "Clinics can search kinesiologists"
on public.profiles for select
to authenticated
using (
  public.current_account_type() = 'CONSULTORIO'
  and account_type = 'KINESIOLOGO'
);

drop policy if exists "Clinic owners can manage clinics" on public.clinics;
create policy "Clinic owners can manage clinics"
on public.clinics for all
to authenticated
using (
  auth.uid() = owner_id
  and public.current_account_type() = 'CONSULTORIO'
)
with check (
  auth.uid() = owner_id
  and public.current_account_type() = 'CONSULTORIO'
);

drop policy if exists "Clinic owners can manage professional links" on public.clinic_professionals;
create policy "Clinic owners can manage professional links"
on public.clinic_professionals for all
to authenticated
using (public.is_clinic_owner(clinic_id))
with check (
  public.is_clinic_owner(clinic_id)
  and professional_id is not null
  and exists (
    select 1
    from public.profiles
    where profiles.id = professional_id
      and profiles.account_type = 'KINESIOLOGO'
      and profiles.email = professional_email
  )
);

drop policy if exists "Professionals can read their invitations" on public.clinic_professionals;
create policy "Professionals can read their invitations"
on public.clinic_professionals for select
to authenticated
using (
  professional_id = auth.uid()
  and public.current_account_type() = 'KINESIOLOGO'
);

drop policy if exists "Professionals can answer invitations" on public.clinic_professionals;
create policy "Professionals can answer invitations"
on public.clinic_professionals for update
to authenticated
using (
  status = 'pending'
  and professional_id = auth.uid()
  and public.current_account_type() = 'KINESIOLOGO'
)
with check (
  professional_id = auth.uid()
  and status in ('accepted', 'rejected')
  and public.current_account_type() = 'KINESIOLOGO'
);

create or replace function public.can_create_independent_practice_records()
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.account_type = 'KINESIOLOGO'
      and profiles.plan = 'INDEPENDIENTE'
      and profiles.estado_plan = 'ACTIVO'
  );
$function$;

create or replace function public.enforce_patient_plan_limit()
returns trigger
as $function$
declare
  current_plan text;
  current_account_type text;
  patient_limit integer;
  active_patients integer;
begin
  select profiles.plan, profiles.account_type, profiles.limite_pacientes
    into current_plan, current_account_type, patient_limit
  from public.profiles
  where profiles.id = new.owner_id;

  if current_account_type = 'KINESIOLOGO' and coalesce(current_plan, 'FREE') <> 'INDEPENDIENTE' then
    raise exception 'Esta funcionalidad está disponible en KineFlow - Particular. Podés activarlo para gestionar tus pacientes, turnos y cobros propios.';
  end if;

  if current_account_type = 'KINESIOLOGO' and coalesce(current_plan, 'FREE') = 'FREE' then
    select count(*)
      into active_patients
    from public.patients
    where owner_id = new.owner_id
      and clinic_id is null
      and status = 'active';

    if active_patients >= coalesce(patient_limit, 5) then
      raise exception 'El Plan Free permite hasta 5 pacientes. Para continuar, activá un plan pago.';
    end if;
  end if;

  return new;
end;
$function$ language plpgsql security definer set search_path = public;

drop policy if exists "Users can create own appointments" on public.appointments;
create policy "Users can create own appointments"
on public.appointments for insert
to authenticated
with check (
  (
    appointment_origin = 'independent'
    and auth.uid() = owner_id
    and public.can_create_independent_practice_records()
    and exists (
      select 1 from public.patients
      where patients.id = patient_id
        and patients.owner_id = auth.uid()
        and patients.status = 'active'
        and patients.clinic_id is null
    )
  )
  or (
    appointment_origin = 'clinic'
    and public.is_clinic_owner(clinic_id)
    and exists (
      select 1
      from public.clinic_professionals
      where clinic_professionals.id = clinic_professional_id
        and clinic_professionals.clinic_id = clinic_id
        and clinic_professionals.professional_id = owner_id
        and clinic_professionals.status = 'accepted'
    )
    and exists (
      select 1 from public.patients
      where patients.id = patient_id
        and patients.owner_id = auth.uid()
        and patients.clinic_id = appointments.clinic_id
        and patients.status = 'active'
    )
  )
);

drop policy if exists "Users can create own evolutions" on public.evolutions;
create policy "Users can create own evolutions"
on public.evolutions for insert
to authenticated
with check (
  (
    auth.uid() = owner_id
    and public.can_create_independent_practice_records()
    and exists (
      select 1 from public.patients
      where patients.id = patient_id
        and patients.owner_id = auth.uid()
        and patients.status = 'active'
        and patients.clinic_id is null
    )
  )
  or (
    auth.uid() = owner_id
    and exists (
      select 1
      from public.appointments
      join public.clinic_professionals
        on clinic_professionals.id = appointments.clinic_professional_id
      where appointments.id = appointment_id
        and appointments.patient_id = patient_id
        and clinic_professionals.professional_id = auth.uid()
        and clinic_professionals.status = 'accepted'
        and clinic_professionals.can_register_evolutions
    )
  )
);
