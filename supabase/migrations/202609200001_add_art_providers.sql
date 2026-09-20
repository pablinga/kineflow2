create table if not exists public.art_providers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint art_providers_workspace_name_unique unique (workspace_id, name)
);

create index if not exists art_providers_workspace_id_idx
  on public.art_providers(workspace_id);

drop trigger if exists set_art_providers_updated_at
on public.art_providers;
create trigger set_art_providers_updated_at
before update on public.art_providers
for each row execute function public.set_updated_at();

alter table public.art_providers enable row level security;

drop policy if exists "Workspace members can manage ART providers"
on public.art_providers;
create policy "Workspace members can manage ART providers"
on public.art_providers for all
to authenticated
using (exists (
  select 1
  from public.workspace_members
  where workspace_members.workspace_id = art_providers.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.status = 'accepted'
))
with check (exists (
  select 1
  from public.workspace_members
  where workspace_members.workspace_id = art_providers.workspace_id
    and workspace_members.user_id = auth.uid()
    and workspace_members.status = 'accepted'
));

alter table public.appointments
  add column if not exists art_provider_id uuid references public.art_providers(id),
  add column if not exists payment_type text not null default 'PARTICULAR';

alter table public.appointments
  add constraint appointments_payment_type_check
  check (payment_type in ('PARTICULAR', 'OBRA_SOCIAL', 'ART'));

update public.appointments
set payment_type = 'OBRA_SOCIAL'
where insurance_provider_id is not null
  and payment_type = 'PARTICULAR';

alter table public.appointments
  add constraint appointments_insurance_art_exclusive_check
  check (not (insurance_provider_id is not null and art_provider_id is not null));
