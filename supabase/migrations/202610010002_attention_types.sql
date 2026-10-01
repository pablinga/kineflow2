-- Catálogo de "Tipos de atención" por workspace (RPG, ATM, Kinesiología
-- general, ...): nombre, duración, precio y si admite turno simultáneo. Al dar
-- un turno se elige uno y se precargan esos valores. No tiene relación con
-- public.treatments (plan de tratamiento del paciente).
--
-- En esta versión la UI lo muestra solo en workspaces CLINICA; la tabla no
-- depende del tipo de workspace.
-- Los tipos no se borran: se desactivan (active = false).

begin;

create table if not exists public.attention_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  duration_minutes integer not null,
  price numeric(12,2),
  allows_simultaneous boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attention_types_name_check check (length(trim(name)) between 1 and 80),
  constraint attention_types_price_check check (price is null or price >= 0),
  -- Mismos valores que appointments_duration_check. Verificado live el
  -- 2026-10-01 en QA y prod: CHECK (duration_minutes = ANY (ARRAY[30, 45, 60, 90])).
  constraint attention_types_duration_check check (duration_minutes in (30, 45, 60, 90))
);

create unique index if not exists attention_types_workspace_name_active_idx
  on public.attention_types (workspace_id, lower(trim(name)))
  where active;

create index if not exists attention_types_workspace_idx
  on public.attention_types (workspace_id, active, sort_order);

drop trigger if exists set_attention_types_updated_at on public.attention_types;
create trigger set_attention_types_updated_at
  before update on public.attention_types
  for each row execute function public.set_updated_at();

alter table public.attention_types enable row level security;

-- Lectura: miembros aceptados del workspace (ADMIN, KINESIOLOGO, RECEPCION).
-- Evalúa la columna de la propia fila, así que el INSERT ... RETURNING funciona.
drop policy if exists "Workspace members can read attention types" on public.attention_types;
create policy "Workspace members can read attention types"
  on public.attention_types for select to authenticated
  using (public.is_workspace_member(workspace_id));

-- Gestión: solo ADMIN.
drop policy if exists "Workspace admins can manage attention types" on public.attention_types;
create policy "Workspace admins can manage attention types"
  on public.attention_types for all to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

revoke all on public.attention_types from anon;

-- Turnos: referencia + copia del nombre (snapshot), para que los turnos viejos
-- conserven el nombre aunque el tipo se renombre o se desactive.
alter table public.appointments
  add column if not exists attention_type_id uuid references public.attention_types(id) on delete set null,
  add column if not exists attention_type_name text;

create index if not exists appointments_attention_type_id_idx
  on public.appointments (attention_type_id);

-- El tipo de atención tiene que ser del mismo workspace que el turno.
create or replace function public.validate_appointment_attention_type()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.attention_type_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.attention_types
    where attention_types.id = new.attention_type_id
      and attention_types.workspace_id is not distinct from new.workspace_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'El tipo de atención no pertenece a este espacio.';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_appointment_attention_type_trigger on public.appointments;
create trigger validate_appointment_attention_type_trigger
  before insert or update of attention_type_id, workspace_id on public.appointments
  for each row execute function public.validate_appointment_attention_type();

commit;
