create table if not exists public.independent_availability (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  weekday integer not null,
  starts_at time not null,
  ends_at time not null,
  active boolean not null default true,
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint independent_availability_weekday_check check (weekday between 0 and 6),
  constraint independent_availability_time_check check (starts_at < ends_at),
  constraint independent_availability_dates_check check (
    valid_from is null or valid_to is null or valid_from <= valid_to
  )
);

create index if not exists independent_availability_owner_id_idx
  on public.independent_availability(owner_id);

drop trigger if exists set_independent_availability_updated_at
on public.independent_availability;
create trigger set_independent_availability_updated_at
before update on public.independent_availability
for each row execute function public.set_updated_at();

alter table public.independent_availability enable row level security;

drop policy if exists "Owners can manage their availability"
on public.independent_availability;
create policy "Owners can manage their availability"
on public.independent_availability for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
