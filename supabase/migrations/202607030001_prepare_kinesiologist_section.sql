create table if not exists public.clinic_professional_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  clinic_professional_id uuid not null references public.clinic_professionals(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  type text not null default 'blocked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinic_professional_availability_exceptions_time_check check (starts_at < ends_at),
  constraint clinic_professional_availability_exceptions_type_check check (
    type in ('blocked', 'vacation', 'available')
  )
);

create index if not exists clinic_professional_availability_exceptions_link_idx
  on public.clinic_professional_availability_exceptions(clinic_professional_id);

create index if not exists clinic_professional_availability_exceptions_range_idx
  on public.clinic_professional_availability_exceptions(starts_at, ends_at);

drop trigger if exists set_clinic_professional_availability_exceptions_updated_at
on public.clinic_professional_availability_exceptions;
create trigger set_clinic_professional_availability_exceptions_updated_at
before update on public.clinic_professional_availability_exceptions
for each row execute function public.set_updated_at();

alter table public.clinic_professional_availability_exceptions enable row level security;

drop policy if exists "Clinic owners can manage availability exceptions"
on public.clinic_professional_availability_exceptions;
create policy "Clinic owners can manage availability exceptions"
on public.clinic_professional_availability_exceptions for all
to authenticated
using (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and (
        public.is_clinic_owner(clinic_professionals.clinic_id)
        or public.is_workspace_admin(public.get_clinic_workspace_id(clinic_professionals.clinic_id))
      )
  )
)
with check (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and (
        public.is_clinic_owner(clinic_professionals.clinic_id)
        or public.is_workspace_admin(public.get_clinic_workspace_id(clinic_professionals.clinic_id))
      )
  )
);

drop policy if exists "Professionals can read availability exceptions"
on public.clinic_professional_availability_exceptions;
create policy "Professionals can read availability exceptions"
on public.clinic_professional_availability_exceptions for select
to authenticated
using (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
  )
);
