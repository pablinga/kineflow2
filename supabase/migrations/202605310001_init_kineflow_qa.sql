create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  account_type text not null default 'KINESIOLOGO',
  email text,
  full_name text not null,
  license_number text,
  phone text,
  specialty text,
  organization_name text,
  organization_address text,
  responsible_name text,
  role text not null default 'kinesiologist',
  plan text not null default 'FREE',
  estado_plan text not null default 'ACTIVO',
  limite_pacientes integer not null default 5,
  cantidad_kinesiologos integer not null default 1,
  fecha_inicio_plan timestamptz,
  fecha_fin_plan timestamptz,
  mercadopago_subscription_id text,
  mercadopago_customer_id text,
  plan_status text,
  subscription_provider text,
  mercado_pago_preapproval_id text,
  subscription_started_at timestamptz,
  subscription_current_period_end timestamptz,
  subscription_canceled_at timestamptz,
  cancel_request_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_account_type_check check (account_type in ('KINESIOLOGO', 'CONSULTORIO')),
  constraint profiles_plan_check check (plan in ('FREE', 'INDEPENDIENTE', 'CLINICA', 'CONSULTORIO_2', 'CONSULTORIO_5', 'CONSULTORIO_10')),
  constraint profiles_estado_plan_check check (estado_plan in ('ACTIVO', 'PENDIENTE', 'VENCIDO', 'CANCELADO')),
  constraint profiles_plan_limits_check check (
    (plan = 'FREE' and limite_pacientes = 5 and cantidad_kinesiologos = 1)
    or (plan = 'INDEPENDIENTE' and limite_pacientes = -1 and cantidad_kinesiologos = 1)
    or (plan = 'CLINICA' and limite_pacientes = -1 and cantidad_kinesiologos >= 2)
    or (plan = 'CONSULTORIO_2' and limite_pacientes = -1 and cantidad_kinesiologos = 2)
    or (plan = 'CONSULTORIO_5' and limite_pacientes = -1 and cantidad_kinesiologos = 5)
    or (plan = 'CONSULTORIO_10' and limite_pacientes = -1 and cantidad_kinesiologos = 10)
  )
);

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  address text,
  responsible_name text,
  color text not null default '#0b97dc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  full_name text not null,
  document_number text not null,
  phone text,
  email text,
  initial_condition text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint patients_status_check check (status in ('active', 'inactive'))
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
  constraint clinic_professionals_status_check check (status in ('pending', 'accepted', 'rejected', 'inactive')),
  constraint clinic_professionals_email_check check (professional_email = lower(trim(professional_email)))
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
  constraint clinic_professional_availability_dates_check check (valid_from is null or valid_to is null or valid_from <= valid_to)
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete set null,
  clinic_professional_id uuid references public.clinic_professionals(id) on delete set null,
  appointment_origin text not null default 'independent',
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 45,
  modality text not null default 'presencial',
  reason text not null,
  status text not null default 'pending',
  notes text,
  session_amount numeric(12, 2) not null default 0,
  payment_status text not null default 'pending',
  payment_method text,
  paid_at date,
  payment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_duration_check check (duration_minutes in (30, 45, 60, 90)),
  constraint appointments_modality_check check (modality in ('presencial', 'domicilio', 'virtual')),
  constraint appointments_status_check check (status in ('pending', 'attended', 'cancelled', 'no_show', 'rescheduled')),
  constraint appointments_payment_status_check check (payment_status in ('pending', 'paid', 'waived', 'not_applicable')),
  constraint appointments_payment_method_check check (payment_method is null or payment_method in ('cash', 'transfer', 'mercado_pago', 'insurance', 'other')),
  constraint appointments_session_amount_check check (session_amount >= 0),
  constraint appointments_origin_check check (appointment_origin in ('independent', 'clinic')),
  constraint appointments_clinic_origin_check check (
    (appointment_origin = 'independent' and clinic_id is null and clinic_professional_id is null)
    or (appointment_origin = 'clinic' and clinic_id is not null and clinic_professional_id is not null)
  )
);

create table if not exists public.evolutions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  session_date date not null default current_date,
  pain_level integer,
  mobility_notes text,
  clinical_notes text not null,
  next_goals text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evolutions_pain_level_check check (pain_level is null or pain_level between 0 and 10)
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  account_type text not null,
  price numeric(12, 2) not null default 0,
  currency text not null default 'ARS',
  billing_period text not null default 'month',
  max_patients integer,
  max_professionals integer,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_account_type_check check (account_type in ('KINESIOLOGO', 'CONSULTORIO')),
  constraint plans_billing_period_check check (billing_period in ('free', 'month'))
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  account_type text not null,
  plan_id uuid not null references public.plans(id),
  provider text not null default 'mercadopago',
  provider_subscription_id text,
  provider_status text,
  status text not null default 'PENDING_PAYMENT',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  cancellation_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_account_type_check check (account_type in ('KINESIOLOGO', 'CONSULTORIO')),
  constraint subscriptions_provider_check check (provider in ('mercadopago')),
  constraint subscriptions_status_check check (status in ('PENDING_PAYMENT', 'ACTIVE', 'PAUSED', 'CANCELLED', 'PAST_DUE', 'EXPIRED'))
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago',
  event_id text not null,
  event_type text,
  payload jsonb not null,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_check check (provider in ('mercadopago'))
);

create index if not exists patients_owner_id_idx on public.patients(owner_id);
create index if not exists patients_status_idx on public.patients(status);
create index if not exists patients_document_number_idx on public.patients(document_number);
create index if not exists patients_clinic_id_idx on public.patients(clinic_id);
create index if not exists appointments_owner_id_idx on public.appointments(owner_id);
create index if not exists appointments_patient_id_idx on public.appointments(patient_id);
create index if not exists appointments_scheduled_at_idx on public.appointments(scheduled_at);
create index if not exists appointments_clinic_id_idx on public.appointments(clinic_id);
create index if not exists appointments_clinic_professional_id_idx on public.appointments(clinic_professional_id);
create index if not exists evolutions_owner_id_idx on public.evolutions(owner_id);
create index if not exists evolutions_patient_id_idx on public.evolutions(patient_id);
create index if not exists evolutions_session_date_idx on public.evolutions(session_date);
create index if not exists clinics_owner_id_idx on public.clinics(owner_id);
create index if not exists clinic_professionals_clinic_id_idx on public.clinic_professionals(clinic_id);
create index if not exists clinic_professionals_professional_id_idx on public.clinic_professionals(professional_id);
create index if not exists clinic_professionals_email_idx on public.clinic_professionals(professional_email);
create unique index if not exists clinic_professionals_unique_invitation_idx on public.clinic_professionals(clinic_id, professional_email) where status in ('pending', 'accepted');
create unique index if not exists clinic_professionals_unique_active_professional_idx on public.clinic_professionals(clinic_id, professional_id) where professional_id is not null and status in ('pending', 'accepted');
create index if not exists clinic_professional_availability_link_idx on public.clinic_professional_availability(clinic_professional_id);
create unique index if not exists payment_events_provider_event_id_idx on public.payment_events(provider, event_id);
create unique index if not exists subscriptions_provider_subscription_idx on public.subscriptions(provider, provider_subscription_id) where provider_subscription_id is not null;
create index if not exists subscriptions_account_id_idx on public.subscriptions(account_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

alter table public.clinic_professionals
  drop constraint if exists clinic_professionals_professional_profile_fk,
  add constraint clinic_professionals_professional_profile_fk
  foreign key (professional_id) references public.profiles(id) on delete set null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.set_default_plan_values()
returns trigger
language plpgsql
as $function$
begin
  new.plan = coalesce(new.plan, 'FREE');
  new.estado_plan = coalesce(new.estado_plan, 'ACTIVO');
  new.fecha_inicio_plan = coalesce(new.fecha_inicio_plan, now());

  if new.plan = 'FREE' then
    new.limite_pacientes = 5;
    new.cantidad_kinesiologos = 1;
  elsif new.plan = 'INDEPENDIENTE' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 1;
  elsif new.plan = 'CLINICA' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = greatest(coalesce(new.cantidad_kinesiologos, 2), 2);
  elsif new.plan = 'CONSULTORIO_2' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 2;
  elsif new.plan = 'CONSULTORIO_5' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 5;
  elsif new.plan = 'CONSULTORIO_10' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 10;
  end if;

  return new;
end;
$function$;

create or replace function public.prevent_profile_billing_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.role() = 'authenticated' and auth.uid() = old.id and (
    new.plan is distinct from old.plan
    or new.estado_plan is distinct from old.estado_plan
    or new.limite_pacientes is distinct from old.limite_pacientes
    or new.cantidad_kinesiologos is distinct from old.cantidad_kinesiologos
    or new.fecha_inicio_plan is distinct from old.fecha_inicio_plan
    or new.fecha_fin_plan is distinct from old.fecha_fin_plan
    or new.mercadopago_subscription_id is distinct from old.mercadopago_subscription_id
    or new.mercadopago_customer_id is distinct from old.mercadopago_customer_id
  ) then
    raise exception 'Los campos del plan solo pueden modificarse desde el backend.';
  end if;

  return new;
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_account_type text;
  organization_name text;
begin
  new_account_type := coalesce(new.raw_user_meta_data->>'account_type', new.raw_user_meta_data->>'accountType', 'KINESIOLOGO');

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
    id, account_type, email, full_name, license_number, phone, specialty,
    organization_name, organization_address, responsible_name, role
  )
  values (
    new.id,
    new_account_type,
    lower(new.email),
    case when new_account_type = 'CONSULTORIO' then organization_name else coalesce(new.raw_user_meta_data->>'full_name', 'Kinesiologo') end,
    case when new_account_type = 'KINESIOLOGO' then new.raw_user_meta_data->>'license_number' else null end,
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'specialty',
    case when new_account_type = 'CONSULTORIO' then organization_name else null end,
    case when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'organization_address' else null end,
    case when new_account_type = 'CONSULTORIO' then new.raw_user_meta_data->>'responsible_name' else null end,
    case when new_account_type = 'CONSULTORIO' then 'clinic' else 'kinesiologist' end
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
    insert into public.clinics (owner_id, name, email, phone, address, responsible_name)
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
$function$;

create or replace function public.current_user_email()
returns text
stable
language sql
as $function$
  select lower(coalesce(auth.jwt()->>'email', ''));
$function$;

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
    join public.clinic_professionals on clinic_professionals.id = appointments.clinic_professional_id
    where appointments.patient_id = target_patient_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
  );
$function$;

create or replace function public.has_active_paid_plan(required_plan text default null)
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
      and profiles.estado_plan = 'ACTIVO'
      and profiles.plan <> 'FREE'
      and (required_plan is null or profiles.plan = required_plan)
  )
  or exists (
    select 1
    from public.subscriptions
    join public.plans on plans.id = subscriptions.plan_id
    where subscriptions.account_id = auth.uid()
      and subscriptions.status = 'ACTIVE'
      and (required_plan is null or plans.code = required_plan)
  );
$function$;

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
      and (profiles.plan = 'FREE' or profiles.plan = 'INDEPENDIENTE')
      and profiles.estado_plan in ('ACTIVO', 'PENDIENTE')
  );
$function$;

create or replace function public.enforce_patient_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_plan text;
  current_status text;
  current_account_type text;
  patient_limit integer;
  active_patients integer;
begin
  select profiles.plan, profiles.estado_plan, profiles.account_type, profiles.limite_pacientes
    into current_plan, current_status, current_account_type, patient_limit
  from public.profiles
  where profiles.id = new.owner_id;

  if current_account_type = 'CONSULTORIO' then
    if new.clinic_id is null
      or coalesce(current_status, 'ACTIVO') <> 'ACTIVO'
      or coalesce(current_plan, 'FREE') not in ('CONSULTORIO_2', 'CONSULTORIO_5', 'CONSULTORIO_10') then
      raise exception 'Para gestionar pacientes del consultorio necesitas una suscripción activa del Plan Consultorio.';
    end if;

    return new;
  end if;

  if coalesce(current_account_type, 'KINESIOLOGO') = 'KINESIOLOGO' then
    if new.clinic_id is not null then
      return new;
    end if;

    if coalesce(current_plan, 'FREE') = 'INDEPENDIENTE' then
      return new;
    end if;

    if coalesce(current_plan, 'FREE') = 'FREE' then
      select count(*)
        into active_patients
      from public.patients
      where owner_id = new.owner_id
        and clinic_id is null
        and status = 'active';

      if active_patients >= coalesce(patient_limit, 5) then
        raise exception 'El Plan Free permite hasta 5 pacientes. Para seguir agregando pacientes, activa KineFlow - Particular.';
      end if;

      return new;
    end if;
  end if;

  raise exception 'Tu plan no permite crear pacientes.';
end;
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
          'El kinesiologo ya tiene un turno de '
          || to_char(timezone('America/Argentina/Buenos_Aires', conflicting_record.scheduled_at), 'HH24:MI')
          || ' a '
          || to_char(timezone('America/Argentina/Buenos_Aires', conflicting_record.ends_at), 'HH24:MI')
          || ' en '
          || conflicting_record.clinic_name
          || '.'
        else
          'El kinesiologo ya tiene un turno asignado en ese horario. Revisa la agenda antes de confirmar.'
      end;
  end if;

  if new.appointment_origin = 'independent' then
    select clinics.name
    into reserved_record
    from public.clinic_professional_availability availability
    join public.clinic_professionals on clinic_professionals.id = availability.clinic_professional_id
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
        message = 'Este horario esta reservado para '
          || reserved_record.name
          || '. En esta franja solo podes atender pacientes asignados por ese consultorio.';
    end if;
  else
    select exists (
      select 1
      from public.clinic_professional_availability availability
      join public.clinic_professionals on clinic_professionals.id = availability.clinic_professional_id
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
        message = 'El turno de consultorio debe estar dentro de una franja asignada y aceptada por el kinesiologo.';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists set_default_plan_values on public.profiles;
create trigger set_default_plan_values before insert or update of plan, cantidad_kinesiologos on public.profiles for each row execute function public.set_default_plan_values();
drop trigger if exists prevent_profile_billing_self_update on public.profiles;
create trigger prevent_profile_billing_self_update before update on public.profiles for each row execute function public.prevent_profile_billing_self_update();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists set_clinics_updated_at on public.clinics;
create trigger set_clinics_updated_at before update on public.clinics for each row execute function public.set_updated_at();
drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at before update on public.patients for each row execute function public.set_updated_at();
drop trigger if exists enforce_patient_plan_limit on public.patients;
create trigger enforce_patient_plan_limit before insert on public.patients for each row execute function public.enforce_patient_plan_limit();
drop trigger if exists set_clinic_professionals_updated_at on public.clinic_professionals;
create trigger set_clinic_professionals_updated_at before update on public.clinic_professionals for each row execute function public.set_updated_at();
drop trigger if exists set_clinic_professional_availability_updated_at on public.clinic_professional_availability;
create trigger set_clinic_professional_availability_updated_at before update on public.clinic_professional_availability for each row execute function public.set_updated_at();
drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at before update on public.appointments for each row execute function public.set_updated_at();
drop trigger if exists validate_appointment_schedule_trigger on public.appointments;
create trigger validate_appointment_schedule_trigger before insert or update of scheduled_at, duration_minutes, owner_id, clinic_id, clinic_professional_id, appointment_origin, status on public.appointments for each row execute function public.validate_appointment_schedule();
drop trigger if exists set_evolutions_updated_at on public.evolutions;
create trigger set_evolutions_updated_at before update on public.evolutions for each row execute function public.set_updated_at();
drop trigger if exists set_plans_updated_at on public.plans;
create trigger set_plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
drop trigger if exists set_subscriptions_updated_at on public.subscriptions;
create trigger set_subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

insert into public.plans (code, name, description, account_type, price, currency, billing_period, max_patients, max_professionals, features)
values
  ('FREE', 'Plan Free', 'Proba KineFlow con una cantidad limitada de pacientes y empeza a ordenar tu practica profesional.', 'KINESIOLOGO', 0, 'ARS', 'free', 5, null, '["Hasta 5 pacientes", "Agenda basica", "Registro basico de evoluciones", "Ideal para probar la herramienta"]'::jsonb),
  ('INDEPENDIENTE', 'KineFlow - Particular', 'Para kinesiólogos que trabajan de forma independiente y quieren organizar su agenda, pacientes, sesiones y cobros desde un solo lugar.', 'KINESIOLOGO', 15000, 'ARS', 'month', null, null, '["Pacientes ilimitados", "Agenda simple para organizar turnos", "Registro de sesiones por paciente", "Evolución de cada tratamiento", "Control de cobros y pagos pendientes", "Información ordenada y fácil de consultar", "Pensado para usar desde el celular"]'::jsonb),
  ('CONSULTORIO_2', 'Plan Consultorio 2', 'Para consultorios con hasta 2 kinesiólogos activos.', 'CONSULTORIO', 29900, 'ARS', 'month', null, 2, '["Pacientes del consultorio", "Agenda multi-profesional", "Invitación de kinesiólogos", "Ingresos del consultorio"]'::jsonb),
  ('CONSULTORIO_5', 'Plan Consultorio 5', 'Para consultorios con hasta 5 kinesiólogos activos.', 'CONSULTORIO', 49900, 'ARS', 'month', null, 5, '["Pacientes del consultorio", "Agenda multi-profesional", "Invitación de kinesiólogos", "Ingresos del consultorio"]'::jsonb),
  ('CONSULTORIO_10', 'Plan Consultorio 10', 'Para consultorios con hasta 10 kinesiólogos activos.', 'CONSULTORIO', 79900, 'ARS', 'month', null, 10, '["Pacientes del consultorio", "Agenda multi-profesional", "Invitación de kinesiólogos", "Ingresos del consultorio"]'::jsonb)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  account_type = excluded.account_type,
  price = excluded.price,
  currency = excluded.currency,
  billing_period = excluded.billing_period,
  max_patients = excluded.max_patients,
  max_professionals = excluded.max_professionals,
  features = excluded.features,
  active = true,
  updated_at = now();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.evolutions enable row level security;
alter table public.clinics enable row level security;
alter table public.clinic_professionals enable row level security;
alter table public.clinic_professional_availability enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Clinics can search kinesiologists" on public.profiles;
create policy "Clinics can search kinesiologists" on public.profiles for select to authenticated using (public.current_account_type() = 'CONSULTORIO' and account_type = 'KINESIOLOGO');
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Clinic owners can manage clinics" on public.clinics;
create policy "Clinic owners can manage clinics" on public.clinics for all to authenticated using (auth.uid() = owner_id and public.current_account_type() = 'CONSULTORIO') with check (auth.uid() = owner_id and public.current_account_type() = 'CONSULTORIO');
drop policy if exists "Accepted professionals can read their clinics" on public.clinics;
create policy "Accepted professionals can read their clinics" on public.clinics for select to authenticated using (public.is_accepted_clinic_professional(id));

drop policy if exists "Clinic owners can manage professional links" on public.clinic_professionals;
create policy "Clinic owners can manage professional links" on public.clinic_professionals for all to authenticated using (public.is_clinic_owner(clinic_id)) with check (
  public.is_clinic_owner(clinic_id)
  and professional_id is not null
  and exists (
    select 1 from public.profiles
    where profiles.id = professional_id
      and profiles.account_type = 'KINESIOLOGO'
      and profiles.email = professional_email
  )
);
drop policy if exists "Professionals can read their invitations" on public.clinic_professionals;
create policy "Professionals can read their invitations" on public.clinic_professionals for select to authenticated using (professional_id = auth.uid() and public.current_account_type() = 'KINESIOLOGO');
drop policy if exists "Professionals can answer invitations" on public.clinic_professionals;
create policy "Professionals can answer invitations" on public.clinic_professionals for update to authenticated using (status = 'pending' and professional_id = auth.uid() and public.current_account_type() = 'KINESIOLOGO') with check (professional_id = auth.uid() and status in ('accepted', 'rejected') and public.current_account_type() = 'KINESIOLOGO');

drop policy if exists "Clinic owners can manage availability" on public.clinic_professional_availability;
create policy "Clinic owners can manage availability" on public.clinic_professional_availability for all to authenticated using (
  exists (
    select 1 from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and public.is_clinic_owner(clinic_professionals.clinic_id)
  )
) with check (
  exists (
    select 1 from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and public.is_clinic_owner(clinic_professionals.clinic_id)
  )
);
drop policy if exists "Professionals can read assigned availability" on public.clinic_professional_availability;
create policy "Professionals can read assigned availability" on public.clinic_professional_availability for select to authenticated using (
  exists (
    select 1 from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and clinic_professionals.professional_id = auth.uid()
  )
);

drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients" on public.patients for select to authenticated using (auth.uid() = owner_id or public.can_access_patient(id));
drop policy if exists "Users can create own patients" on public.patients;
create policy "Users can create own patients" on public.patients for insert to authenticated with check (auth.uid() = owner_id and (clinic_id is null or public.is_clinic_owner(clinic_id)));
drop policy if exists "Users can update own patients" on public.patients;
create policy "Users can update own patients" on public.patients for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id and (clinic_id is null or public.is_clinic_owner(clinic_id)));
drop policy if exists "Users can delete own patients" on public.patients;
create policy "Users can delete own patients" on public.patients for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "Users can read own appointments" on public.appointments;
create policy "Users can read own appointments" on public.appointments for select to authenticated using (auth.uid() = owner_id or public.is_clinic_owner(clinic_id));
drop policy if exists "Users can create own appointments" on public.appointments;
create policy "Users can create own appointments" on public.appointments for insert to authenticated with check (
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
      select 1 from public.clinic_professionals
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
create policy "Users can update own appointments" on public.appointments for update to authenticated using (auth.uid() = owner_id or public.is_clinic_owner(clinic_id)) with check (auth.uid() = owner_id or public.is_clinic_owner(clinic_id));
drop policy if exists "Users can delete own appointments" on public.appointments;
create policy "Users can delete own appointments" on public.appointments for delete to authenticated using (auth.uid() = owner_id or public.is_clinic_owner(clinic_id));

drop policy if exists "Users can read own evolutions" on public.evolutions;
create policy "Users can read own evolutions" on public.evolutions for select to authenticated using (auth.uid() = owner_id or public.can_access_patient(patient_id));
drop policy if exists "Users can create own evolutions" on public.evolutions;
create policy "Users can create own evolutions" on public.evolutions for insert to authenticated with check (
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
      join public.clinic_professionals on clinic_professionals.id = appointments.clinic_professional_id
      where appointments.id = appointment_id
        and appointments.patient_id = patient_id
        and clinic_professionals.professional_id = auth.uid()
        and clinic_professionals.status = 'accepted'
        and clinic_professionals.can_register_evolutions
    )
  )
);
drop policy if exists "Users can update own evolutions" on public.evolutions;
create policy "Users can update own evolutions" on public.evolutions for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "Users can delete own evolutions" on public.evolutions;
create policy "Users can delete own evolutions" on public.evolutions for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists "Anyone authenticated can read active plans" on public.plans;
create policy "Anyone authenticated can read active plans" on public.plans for select to authenticated using (active);
drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions" on public.subscriptions for select to authenticated using (account_id = auth.uid());

-- No storage buckets are required by the current application code.
