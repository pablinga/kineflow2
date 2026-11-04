-- Historia clínica más completa (pedido de una clínica usuaria, 2026-11-03).
-- Paciente: fecha de nacimiento (la edad se calcula) y ocupación.
-- Evaluación inicial: antecedentes, medicación, actividad física, estudios
-- complementarios (texto + archivos), anamnesis, evaluación funcional
-- estática / dinámica y tratamiento inicial. Todo opcional.
-- Archivos de estudios: bucket privado `estudios-complementarios`, ruta
-- <workspace_id>/<evaluation_id>/<archivo>; la lista va en
-- patient_evaluations.study_files (jsonb). Mismos permisos que la evaluación:
-- lee quien puede leerla; sube / borra quien puede editarla (su autor).

begin;

alter table public.patients
  add column if not exists birth_date date,
  add column if not exists occupation text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patients_birth_date_check') then
    alter table public.patients
      add constraint patients_birth_date_check check (birth_date is null or birth_date >= date '1900-01-01');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'patients_occupation_check') then
    alter table public.patients
      add constraint patients_occupation_check check (occupation is null or length(occupation) <= 120);
  end if;
end $$;

alter table public.patient_evaluations
  add column if not exists clinical_history text,
  add column if not exists surgical_history text,
  add column if not exists usual_medication text,
  add column if not exists physical_activity text,
  add column if not exists complementary_studies text,
  add column if not exists anamnesis text,
  add column if not exists functional_static text,
  add column if not exists functional_dynamic text,
  add column if not exists initial_treatment text,
  add column if not exists study_files jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patient_evaluations_study_files_check') then
    alter table public.patient_evaluations
      add constraint patient_evaluations_study_files_check
      check (jsonb_typeof(study_files) = 'array' and jsonb_array_length(study_files) <= 20);
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'estudios-complementarios',
  'estudios-complementarios',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_access_evaluation_storage_object(
  target_storage_path text,
  require_manage boolean
)
returns boolean
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  path_parts text[];
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  path_parts := string_to_array(target_storage_path, '/');

  if array_length(path_parts, 1) <> 3
    or path_parts[1] !~* uuid_pattern
    or path_parts[2] !~* uuid_pattern then
    return false;
  end if;

  -- Igual que las policies de patient_evaluations (leer / editar).
  return exists (
    select 1
    from public.patient_evaluations e
    where e.id = path_parts[2]::uuid
      and e.workspace_id = path_parts[1]::uuid
      and (
        case
          when require_manage then
            e.owner_id = auth.uid() and public.can_access_workspace_patient(e.patient_id)
          else
            e.owner_id = auth.uid() or public.can_access_workspace_patient(e.patient_id)
        end
      )
  );
end;
$function$;

revoke all on function public.can_access_evaluation_storage_object(text, boolean) from public, anon;
grant execute on function public.can_access_evaluation_storage_object(text, boolean) to authenticated;

-- Políticas en bloques "if not exists" (sin drop policy): el conector de
-- Supabase cancela las sentencias destructivas.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Evaluation study files read access'
  ) then
    create policy "Evaluation study files read access"
    on storage.objects for select
    to authenticated
    using (
      bucket_id = 'estudios-complementarios'
      and public.can_access_evaluation_storage_object(name, false)
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Evaluation study files insert access'
  ) then
    create policy "Evaluation study files insert access"
    on storage.objects for insert
    to authenticated
    with check (
      bucket_id = 'estudios-complementarios'
      and public.can_access_evaluation_storage_object(name, true)
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Evaluation study files delete access'
  ) then
    create policy "Evaluation study files delete access"
    on storage.objects for delete
    to authenticated
    using (
      bucket_id = 'estudios-complementarios'
      and public.can_access_evaluation_storage_object(name, true)
    );
  end if;
end $$;

commit;
