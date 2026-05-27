create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  color text not null default '#0b97dc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinic_professionals (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  professional_id uuid references auth.users(id) on delete set null,
  professional_email text not null,
  status text not null default 'pending',
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  color text not null default '#14b8a6',
  role text not null default 'kinesiologist',
  can_register_evolutions boolean not null default true,
  can_view_assigned_patients boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_professionals_status_check check (
    status in ('pending', 'accepted', 'rejected', 'inactive')
  ),
  constraint clinic_professionals_email_check check (
    professional_email = lower(trim(professional_email))
  )
);

create table if not exists public.clinic_professional_availability (
  id uuid primary key default gen_random_uuid(),
  clinic_professional_id uuid not null references public.clinic_professionals(id) on delete cascade,
  weekday integer not null,
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_professional_availability_weekday_check check (weekday between 0 and 6),
  constraint clinic_professional_availability_time_check check (starts_at < ends_at),
  constraint clinic_professional_availability_dates_check check (
    valid_from is null or valid_to is null or valid_from <= valid_to
  )
);

alter table public.patients
  add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;

alter table public.appointments
  add column if not exists clinic_id uuid references public.clinics(id) on delete set null,
  add column if not exists clinic_professional_id uuid references public.clinic_professionals(id) on delete set null,
  add column if not exists appointment_origin text not null default 'independent';

alter table public.appointments
  drop constraint if exists appointments_origin_check,
  add constraint appointments_origin_check check (
    appointment_origin in ('independent', 'clinic')
  );

alter table public.appointments
  drop constraint if exists appointments_clinic_origin_check,
  add constraint appointments_clinic_origin_check check (
    (
      appointment_origin = 'independent'
      and clinic_id is null
      and clinic_professional_id is null
    )
    or (
      appointment_origin = 'clinic'
      and clinic_id is not null
      and clinic_professional_id is not null
    )
  );

create index if not exists clinics_owner_id_idx on public.clinics(owner_id);
create index if not exists clinic_professionals_clinic_id_idx on public.clinic_professionals(clinic_id);
create index if not exists clinic_professionals_professional_id_idx on public.clinic_professionals(professional_id);
create index if not exists clinic_professionals_email_idx on public.clinic_professionals(professional_email);
create unique index if not exists clinic_professionals_unique_invitation_idx
  on public.clinic_professionals(clinic_id, professional_email)
  where status in ('pending', 'accepted');
create index if not exists clinic_professional_availability_link_idx
  on public.clinic_professional_availability(clinic_professional_id);
create index if not exists patients_clinic_id_idx on public.patients(clinic_id);
create index if not exists appointments_clinic_id_idx on public.appointments(clinic_id);
create index if not exists appointments_clinic_professional_id_idx
  on public.appointments(clinic_professional_id);

drop trigger if exists set_clinics_updated_at on public.clinics;
create trigger set_clinics_updated_at
before update on public.clinics
for each row execute function public.set_updated_at();

drop trigger if exists set_clinic_professionals_updated_at on public.clinic_professionals;
create trigger set_clinic_professionals_updated_at
before update on public.clinic_professionals
for each row execute function public.set_updated_at();

drop trigger if exists set_clinic_professional_availability_updated_at
on public.clinic_professional_availability;
create trigger set_clinic_professional_availability_updated_at
before update on public.clinic_professional_availability
for each row execute function public.set_updated_at();

create or replace function public.current_user_email()
returns text
stable
language sql
as $function$
  select lower(coalesce(auth.jwt()->>'email', ''));
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
    where clinics.id = target_clinic_id
      and clinics.owner_id = auth.uid()
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
    where clinic_professionals.clinic_id = target_clinic_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
  );
$function$;

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

create or replace function public.validate_appointment_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  conflicting_record record;
  reserved_record record;
  availability_exists boolean;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  new_end := new.scheduled_at + make_interval(mins => new.duration_minutes);
  local_start := timezone('America/Argentina/Buenos_Aires', new.scheduled_at);
  local_end := timezone('America/Argentina/Buenos_Aires', new_end);

  select appointments.scheduled_at,
    appointments.scheduled_at + make_interval(mins => appointments.duration_minutes) as ends_at,
    clinics.name as clinic_name
  into conflicting_record
  from public.appointments
  left join public.clinics on clinics.id = appointments.clinic_id
  where appointments.owner_id = new.owner_id
    and appointments.status <> 'cancelled'
    and appointments.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and appointments.scheduled_at < new_end
    and appointments.scheduled_at + make_interval(mins => appointments.duration_minutes) > new.scheduled_at
  order by appointments.scheduled_at
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = case
        when conflicting_record.clinic_name is not null then
          'El kinesiólogo ya tiene un turno de '
          || to_char(timezone('America/Argentina/Buenos_Aires', conflicting_record.scheduled_at), 'HH24:MI')
          || ' a '
          || to_char(timezone('America/Argentina/Buenos_Aires', conflicting_record.ends_at), 'HH24:MI')
          || ' en '
          || conflicting_record.clinic_name
          || '.'
        else
          'El kinesiólogo ya tiene un turno asignado en ese horario. Revisá la agenda antes de confirmar.'
      end;
  end if;

  if new.appointment_origin = 'independent' then
    select clinics.name
    into reserved_record
    from public.clinic_professional_availability availability
    join public.clinic_professionals
      on clinic_professionals.id = availability.clinic_professional_id
    join public.clinics on clinics.id = clinic_professionals.clinic_id
    where clinic_professionals.professional_id = new.owner_id
      and clinic_professionals.status = 'accepted'
      and availability.active
      and availability.weekday = extract(dow from local_start)::integer
      and (availability.valid_from is null or local_start::date >= availability.valid_from)
      and (availability.valid_to is null or local_start::date <= availability.valid_to)
      and local_start::time < availability.ends_at
      and local_end::time > availability.starts_at
    order by availability.starts_at
    limit 1;

    if found then
      raise exception using
        errcode = 'P0001',
        message = 'Este horario está reservado para '
          || reserved_record.name
          || '. En esta franja solo podés atender pacientes asignados por ese consultorio.';
    end if;
  else
    select exists (
      select 1
      from public.clinic_professional_availability availability
      join public.clinic_professionals
        on clinic_professionals.id = availability.clinic_professional_id
      where availability.clinic_professional_id = new.clinic_professional_id
        and clinic_professionals.clinic_id = new.clinic_id
        and clinic_professionals.professional_id = new.owner_id
        and clinic_professionals.status = 'accepted'
        and availability.active
        and availability.weekday = extract(dow from local_start)::integer
        and (availability.valid_from is null or local_start::date >= availability.valid_from)
        and (availability.valid_to is null or local_start::date <= availability.valid_to)
        and local_start::time >= availability.starts_at
        and local_end::time <= availability.ends_at
    ) into availability_exists;

    if not availability_exists then
      raise exception using
        errcode = 'P0001',
        message = 'El turno de consultorio debe estar dentro de una franja asignada y aceptada por el kinesiólogo.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_appointment_schedule_trigger on public.appointments;
create trigger validate_appointment_schedule_trigger
before insert or update of scheduled_at, duration_minutes, owner_id, clinic_id, clinic_professional_id, appointment_origin, status
on public.appointments
for each row execute function public.validate_appointment_schedule();

alter table public.clinics enable row level security;
alter table public.clinic_professionals enable row level security;
alter table public.clinic_professional_availability enable row level security;

drop policy if exists "Clinic owners can manage clinics" on public.clinics;
create policy "Clinic owners can manage clinics"
on public.clinics for all
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Accepted professionals can read their clinics" on public.clinics;
create policy "Accepted professionals can read their clinics"
on public.clinics for select
to authenticated
using (public.is_accepted_clinic_professional(id));

drop policy if exists "Clinic owners can manage professional links" on public.clinic_professionals;
create policy "Clinic owners can manage professional links"
on public.clinic_professionals for all
to authenticated
using (public.is_clinic_owner(clinic_id))
with check (
  public.is_clinic_owner(clinic_id)
  and professional_email = lower(trim(professional_email))
);

drop policy if exists "Professionals can read their invitations" on public.clinic_professionals;
create policy "Professionals can read their invitations"
on public.clinic_professionals for select
to authenticated
using (
  professional_id = auth.uid()
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
);

drop policy if exists "Clinic owners can manage availability" on public.clinic_professional_availability;
create policy "Clinic owners can manage availability"
on public.clinic_professional_availability for all
to authenticated
using (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and public.is_clinic_owner(clinic_professionals.clinic_id)
  )
)
with check (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and public.is_clinic_owner(clinic_professionals.clinic_id)
  )
);

drop policy if exists "Professionals can read assigned availability" on public.clinic_professional_availability;
create policy "Professionals can read assigned availability"
on public.clinic_professional_availability for select
to authenticated
using (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and (
        clinic_professionals.professional_id = auth.uid()
        or (
          clinic_professionals.professional_id is null
          and clinic_professionals.professional_email = public.current_user_email()
        )
      )
  )
);

drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients"
on public.patients for select
to authenticated
using (
  auth.uid() = owner_id
  or public.can_access_patient(id)
);

drop policy if exists "Users can create own patients" on public.patients;
create policy "Users can create own patients"
on public.patients for insert
to authenticated
with check (
  auth.uid() = owner_id
  and (
    clinic_id is null
    or public.is_clinic_owner(clinic_id)
  )
);

drop policy if exists "Users can update own patients" on public.patients;
create policy "Users can update own patients"
on public.patients for update
to authenticated
using (auth.uid() = owner_id)
with check (
  auth.uid() = owner_id
  and (
    clinic_id is null
    or public.is_clinic_owner(clinic_id)
  )
);

drop policy if exists "Users can read own appointments" on public.appointments;
create policy "Users can read own appointments"
on public.appointments for select
to authenticated
using (
  auth.uid() = owner_id
  or public.is_clinic_owner(clinic_id)
);

drop policy if exists "Users can create own appointments" on public.appointments;
create policy "Users can create own appointments"
on public.appointments for insert
to authenticated
with check (
  (
    appointment_origin = 'independent'
    and auth.uid() = owner_id
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

drop policy if exists "Users can update own appointments" on public.appointments;
create policy "Users can update own appointments"
on public.appointments for update
to authenticated
using (
  auth.uid() = owner_id
  or public.is_clinic_owner(clinic_id)
)
with check (
  auth.uid() = owner_id
  or public.is_clinic_owner(clinic_id)
);

drop policy if exists "Users can delete own appointments" on public.appointments;
create policy "Users can delete own appointments"
on public.appointments for delete
to authenticated
using (
  auth.uid() = owner_id
  or public.is_clinic_owner(clinic_id)
);

drop policy if exists "Users can read own evolutions" on public.evolutions;
create policy "Users can read own evolutions"
on public.evolutions for select
to authenticated
using (
  auth.uid() = owner_id
  or public.can_access_patient(patient_id)
);

drop policy if exists "Users can create own evolutions" on public.evolutions;
create policy "Users can create own evolutions"
on public.evolutions for insert
to authenticated
with check (
  (
    auth.uid() = owner_id
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
