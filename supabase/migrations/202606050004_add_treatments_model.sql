create table if not exists public.treatments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  diagnosis text not null,
  body_region text,
  total_sessions integer not null default 10,
  used_sessions integer not null default 0,
  status text not null default 'EN_CURSO',
  started_at date not null default current_date,
  ended_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments
add column if not exists treatment_id uuid references public.treatments(id) on delete set null,
add column if not exists session_number integer;

alter table public.evolutions
add column if not exists treatment_id uuid references public.treatments(id) on delete set null;

create index if not exists treatments_patient_id_idx on public.treatments(patient_id);
create index if not exists treatments_owner_id_idx on public.treatments(owner_id);
create index if not exists appointments_treatment_id_idx on public.appointments(treatment_id);
create index if not exists evolutions_treatment_id_idx on public.evolutions(treatment_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'treatments_status_check'
  ) then
    alter table public.treatments
    add constraint treatments_status_check
    check (status in ('EN_CURSO', 'PAUSADO', 'FINALIZADO', 'ABANDONADO'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'treatments_sessions_check'
  ) then
    alter table public.treatments
    add constraint treatments_sessions_check
    check (used_sessions >= 0 and used_sessions <= total_sessions);
  end if;
end $$;

drop trigger if exists set_treatments_updated_at on public.treatments;
create trigger set_treatments_updated_at
before update on public.treatments
for each row execute function public.set_updated_at();

alter table public.treatments enable row level security;

drop policy if exists "Owner full access" on public.treatments;
create policy "Owner full access"
on public.treatments for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Service role full access" on public.treatments;
create policy "Service role full access"
on public.treatments for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
