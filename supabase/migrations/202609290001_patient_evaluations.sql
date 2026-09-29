-- Evaluación kinésica del paciente. Reemplaza al "tratamiento inicial" del
-- alta: primero se evalúa y el tratamiento se crea aparte (opcionalmente desde
-- una evaluación, que precarga diagnóstico, región y sesiones).
--
-- Un paciente puede tener varias evaluaciones (inicial y reevaluaciones).
-- Permisos iguales a las evoluciones: crea el admin del espacio o el
-- profesional asignado (en clínica, con can_register_evolutions); el staff
-- (incluida recepción) solo lee.

begin;

create table if not exists public.patient_evaluations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  evaluated_at date not null
    default (timezone('America/Argentina/Buenos_Aires', now()))::date,
  pain_level integer not null check (pain_level between 0 and 10),
  pain_location text not null check (length(trim(pain_location)) > 0),
  onset text check (
    onset in ('traumatico', 'insidioso', 'post_quirurgico', 'sobreuso', 'otro')
  ),
  medical_diagnosis text,
  exam_findings text,
  kinesic_diagnosis text not null check (length(trim(kinesic_diagnosis)) > 0),
  goals text,
  suggested_sessions integer check (suggested_sessions between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_evaluations_patient_idx
  on public.patient_evaluations (patient_id, evaluated_at desc);
create index if not exists patient_evaluations_workspace_idx
  on public.patient_evaluations (workspace_id);

alter table public.treatments
  add column if not exists evaluation_id uuid
  references public.patient_evaluations (id) on delete set null;

-- Mismo bloqueo por cuenta en solo lectura que las evoluciones
-- (la función solo llama a raise_if_account_read_only(new.owner_id)).
drop trigger if exists enforce_patient_evaluation_account_mode on public.patient_evaluations;
create trigger enforce_patient_evaluation_account_mode
  before insert or update on public.patient_evaluations
  for each row execute function public.enforce_evolution_patient_limit();

drop trigger if exists set_patient_evaluations_updated_at on public.patient_evaluations;
create trigger set_patient_evaluations_updated_at
  before update on public.patient_evaluations
  for each row execute function public.set_updated_at();

alter table public.patient_evaluations enable row level security;

drop policy if exists "Users can read patient evaluations" on public.patient_evaluations;
create policy "Users can read patient evaluations"
  on public.patient_evaluations
  for select
  to authenticated
  -- owner_id sobre la propia fila: necesario para el INSERT ... RETURNING.
  using (owner_id = auth.uid() or public.can_access_workspace_patient(patient_id));

drop policy if exists "Users can create patient evaluations" on public.patient_evaluations;
create policy "Users can create patient evaluations"
  on public.patient_evaluations
  for insert
  to authenticated
  with check (
    public.can_insert_workspace_evolution(workspace_id, owner_id, patient_id, null)
  );

drop policy if exists "Users can update own patient evaluations" on public.patient_evaluations;
create policy "Users can update own patient evaluations"
  on public.patient_evaluations
  for update
  to authenticated
  using (owner_id = auth.uid() and public.can_access_workspace_patient(patient_id))
  with check (owner_id = auth.uid() and public.can_access_workspace_patient(patient_id));

drop policy if exists "Users can delete own patient evaluations" on public.patient_evaluations;
create policy "Users can delete own patient evaluations"
  on public.patient_evaluations
  for delete
  to authenticated
  using (owner_id = auth.uid() and public.can_access_workspace_patient(patient_id));

drop policy if exists "Service role full access" on public.patient_evaluations;
create policy "Service role full access"
  on public.patient_evaluations
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete on public.patient_evaluations to authenticated;
revoke all on public.patient_evaluations from anon;

commit;
