-- Perfil público por espacio de trabajo (página /reservar/[workspaceId]):
-- kinesiólogo particular (PERSONAL) o clínica (CLINICA). Solo campos de
-- perfil: nunca datos de pacientes.
--
-- - Lectura pública (anon) solo de las columnas del perfil; el consentimiento
--   del buscador y las fechas no son públicos.
-- - Solo el dueño del espacio (workspaces.owner_id) crea y edita su perfil.
-- - listed_in_directory: opt-in para un futuro buscador de KineFlow (false por
--   defecto); listed_in_directory_at guarda cuándo se dio el consentimiento.
-- - acquisition_events suma profile_view y profile_footer_click.

create table if not exists public.workspace_public_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  treatments text[] not null default '{}'
    check (treatments <@ array['rpg', 'deportiva', 'respiratoria', 'piso_pelvico',
                               'atm', 'drenaje_linfatico', 'traumatologia', 'neurologica']::text[]),
  insurance_notes text check (char_length(insurance_notes) <= 300),
  home_visits boolean not null default false,
  bio text check (char_length(bio) <= 400),
  public_address text check (char_length(public_address) <= 200),
  city text check (char_length(city) <= 80),
  license_number text check (char_length(license_number) <= 40),
  listed_in_directory boolean not null default false,
  listed_in_directory_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_public_profiles enable row level security;

revoke all on public.workspace_public_profiles from anon, authenticated;

-- Lectura pública: solo las columnas del perfil.
grant select (workspace_id, treatments, insurance_notes, home_visits, bio,
              public_address, city, license_number)
  on public.workspace_public_profiles to anon;

-- Edición: solo el dueño del espacio. La condición usa workspace_id de la
-- propia fila, así insert().select() funciona (ver nota de RLS en CLAUDE.md).
grant select, insert, update on public.workspace_public_profiles to authenticated;

-- Idempotente sin drop (el conector de Supabase pide confirmación para drop).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'workspace_public_profiles' and policyname = 'Public can read profiles') then
    create policy "Public can read profiles" on public.workspace_public_profiles
      for select to anon using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'workspace_public_profiles' and policyname = 'Owner can read own profile') then
    create policy "Owner can read own profile" on public.workspace_public_profiles
      for select to authenticated
      using (exists (select 1 from public.workspaces w
                     where w.id = workspace_id and w.owner_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'workspace_public_profiles' and policyname = 'Owner can insert own profile') then
    create policy "Owner can insert own profile" on public.workspace_public_profiles
      for insert to authenticated
      with check (exists (select 1 from public.workspaces w
                          where w.id = workspace_id and w.owner_id = auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'workspace_public_profiles' and policyname = 'Owner can update own profile') then
    create policy "Owner can update own profile" on public.workspace_public_profiles
      for update to authenticated
      using (exists (select 1 from public.workspaces w
                     where w.id = workspace_id and w.owner_id = auth.uid()))
      with check (exists (select 1 from public.workspaces w
                          where w.id = workspace_id and w.owner_id = auth.uid()));
  end if;
end $$;

-- updated_at y fecha del consentimiento (no la puede fijar el cliente).
create or replace function public.touch_workspace_public_profile()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at := now();

  if new.listed_in_directory then
    if tg_op = 'INSERT' or not old.listed_in_directory then
      new.listed_in_directory_at := now();
    else
      new.listed_in_directory_at := old.listed_in_directory_at;
    end if;
  else
    new.listed_in_directory_at := null;
  end if;

  return new;
end;
$fn$;

create or replace trigger workspace_public_profiles_touch
  before insert or update on public.workspace_public_profiles
  for each row execute function public.touch_workspace_public_profile();

-- Nuevos eventos del embudo: vista del perfil y clic en el pie.
alter table public.acquisition_events
  drop constraint if exists acquisition_events_event_type_check,
  add constraint acquisition_events_event_type_check check (event_type in
    ('landing_view', 'signup_started', 'profile_view', 'profile_footer_click'));
