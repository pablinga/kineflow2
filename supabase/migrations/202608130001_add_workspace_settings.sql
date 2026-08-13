alter table public.workspaces
  add column if not exists default_session_price numeric,
  add column if not exists default_session_duration_minutes integer,
  add column if not exists min_booking_notice_hours integer not null default 0;

create table if not exists public.insurance_providers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insurance_providers_workspace_name_unique unique (workspace_id, name)
);

create index if not exists insurance_providers_workspace_id_idx
  on public.insurance_providers(workspace_id);

drop trigger if exists set_insurance_providers_updated_at
on public.insurance_providers;
create trigger set_insurance_providers_updated_at
before update on public.insurance_providers
for each row execute function public.set_updated_at();

alter table public.insurance_providers enable row level security;

drop policy if exists "Workspace members can manage insurance providers"
on public.insurance_providers;
create policy "Workspace members can manage insurance providers"
on public.insurance_providers for all
to authenticated
using (exists (
  select 1
  from public.workspace_members
  where workspace_members.workspace_id = insurance_providers.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.status = 'accepted'
))
with check (exists (
  select 1
  from public.workspace_members
  where workspace_members.workspace_id = insurance_providers.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.status = 'accepted'
));

create table if not exists public.workspace_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  blocked_date date not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint workspace_blocked_dates_unique unique (workspace_id, blocked_date)
);

create index if not exists workspace_blocked_dates_workspace_id_idx
  on public.workspace_blocked_dates(workspace_id);

alter table public.workspace_blocked_dates enable row level security;

drop policy if exists "Workspace members can manage blocked dates"
on public.workspace_blocked_dates;
create policy "Workspace members can manage blocked dates"
on public.workspace_blocked_dates for all
to authenticated
using (exists (
  select 1
  from public.workspace_members
  where workspace_members.workspace_id = workspace_blocked_dates.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.status = 'accepted'
))
with check (exists (
  select 1
  from public.workspace_members
  where workspace_members.workspace_id = workspace_blocked_dates.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.status = 'accepted'
));

alter table public.patients
  add column if not exists insurance_provider_id uuid references public.insurance_providers(id),
  add column if not exists insurance_member_number text;
