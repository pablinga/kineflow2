create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  license_number text,
  role text not null default 'kinesiologist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
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

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 45,
  modality text not null default 'presencial',
  reason text not null,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_duration_check check (duration_minutes in (30, 45, 60, 90)),
  constraint appointments_modality_check check (modality in ('presencial', 'virtual')),
  constraint appointments_status_check check (status in ('pending', 'confirmed', 'cancelled', 'completed'))
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

create index if not exists patients_owner_id_idx on public.patients(owner_id);
create index if not exists patients_status_idx on public.patients(status);
create index if not exists patients_document_number_idx on public.patients(document_number);
create index if not exists appointments_owner_id_idx on public.appointments(owner_id);
create index if not exists appointments_patient_id_idx on public.appointments(patient_id);
create index if not exists appointments_scheduled_at_idx on public.appointments(scheduled_at);
create index if not exists evolutions_owner_id_idx on public.evolutions(owner_id);
create index if not exists evolutions_patient_id_idx on public.evolutions(patient_id);
create index if not exists evolutions_session_date_idx on public.evolutions(session_date);

create or replace function public.set_updated_at()
returns trigger
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$ language plpgsql;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists set_evolutions_updated_at on public.evolutions;
create trigger set_evolutions_updated_at
before update on public.evolutions
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
as $function$
begin
  insert into public.profiles (id, full_name, license_number, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'Kinesiologo'),
    new.raw_user_meta_data->>'license_number',
    coalesce(new.raw_user_meta_data->>'role', 'kinesiologist')
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    license_number = excluded.license_number,
    role = excluded.role,
    updated_at = now();

  return new;
end;
$function$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.evolutions enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients"
on public.patients for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can create own patients" on public.patients;
create policy "Users can create own patients"
on public.patients for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Users can update own patients" on public.patients;
create policy "Users can update own patients"
on public.patients for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own patients" on public.patients;
create policy "Users can delete own patients"
on public.patients for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can read own appointments" on public.appointments;
create policy "Users can read own appointments"
on public.appointments for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can create own appointments" on public.appointments;
create policy "Users can create own appointments"
on public.appointments for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.patients
    where patients.id = patient_id
      and patients.owner_id = auth.uid()
      and patients.status = 'active'
  )
);

drop policy if exists "Users can update own appointments" on public.appointments;
create policy "Users can update own appointments"
on public.appointments for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own appointments" on public.appointments;
create policy "Users can delete own appointments"
on public.appointments for delete
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can read own evolutions" on public.evolutions;
create policy "Users can read own evolutions"
on public.evolutions for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Users can create own evolutions" on public.evolutions;
create policy "Users can create own evolutions"
on public.evolutions for insert
to authenticated
with check (
  auth.uid() = owner_id
  and exists (
    select 1 from public.patients
    where patients.id = patient_id
      and patients.owner_id = auth.uid()
      and patients.status = 'active'
  )
);

drop policy if exists "Users can update own evolutions" on public.evolutions;
create policy "Users can update own evolutions"
on public.evolutions for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Users can delete own evolutions" on public.evolutions;
create policy "Users can delete own evolutions"
on public.evolutions for delete
to authenticated
using (auth.uid() = owner_id);
