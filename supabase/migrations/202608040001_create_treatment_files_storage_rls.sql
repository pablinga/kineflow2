create table if not exists public.tratamiento_archivos (
  id uuid primary key default gen_random_uuid(),
  tratamiento_id uuid not null references public.treatments(id) on delete cascade,
  paciente_id uuid not null references public.patients(id) on delete cascade,
  clinica_id uuid references public.clinics(id) on delete cascade,
  subido_por uuid not null references public.profiles(id) on delete restrict,
  nombre_original text not null,
  storage_path text not null unique,
  mime_type text not null,
  tamanio_bytes bigint not null,
  categoria text,
  descripcion text,
  fecha_documento date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tratamiento_archivos_mime_type_check check (
    mime_type in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
  ),
  constraint tratamiento_archivos_tamanio_bytes_check check (
    tamanio_bytes > 0
    and tamanio_bytes <= 10485760
  )
);

create index if not exists tratamiento_archivos_tratamiento_id_idx
  on public.tratamiento_archivos(tratamiento_id);

create index if not exists tratamiento_archivos_paciente_id_idx
  on public.tratamiento_archivos(paciente_id);

create index if not exists tratamiento_archivos_clinica_id_idx
  on public.tratamiento_archivos(clinica_id)
  where clinica_id is not null;

create index if not exists tratamiento_archivos_subido_por_idx
  on public.tratamiento_archivos(subido_por);

drop trigger if exists set_tratamiento_archivos_updated_at
on public.tratamiento_archivos;
create trigger set_tratamiento_archivos_updated_at
before update on public.tratamiento_archivos
for each row execute function public.set_updated_at();

create or replace function public.validate_treatment_file_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if tg_op = 'UPDATE' then
    if new.id <> old.id
      or new.tratamiento_id <> old.tratamiento_id
      or new.paciente_id <> old.paciente_id
      or new.clinica_id is distinct from old.clinica_id
      or new.subido_por <> old.subido_por
      or new.storage_path <> old.storage_path
      or new.mime_type <> old.mime_type
      or new.tamanio_bytes <> old.tamanio_bytes then
      raise exception 'No se pueden modificar los vinculos ni los datos de almacenamiento del archivo.';
    end if;
  end if;

  if not exists (
    select 1
    from public.treatments
    join public.patients on patients.id = treatments.patient_id
    left join public.workspaces on workspaces.id = treatments.workspace_id
    where treatments.id = new.tratamiento_id
      and patients.id = new.paciente_id
      and treatments.patient_id = new.paciente_id
      and treatments.workspace_id = patients.workspace_id
      and patients.clinic_id is not distinct from new.clinica_id
      and (
        (
          patients.clinic_id is null
          and workspaces.type = 'PERSONAL'
        )
        or (
          patients.clinic_id is not null
          and workspaces.type = 'CLINICA'
          and workspaces.source_clinic_id = patients.clinic_id
        )
      )
  ) then
    raise exception 'El archivo debe pertenecer al tratamiento, paciente y espacio de trabajo indicados.';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_treatment_file_context
on public.tratamiento_archivos;
create trigger validate_treatment_file_context
before insert or update on public.tratamiento_archivos
for each row execute function public.validate_treatment_file_context();

create or replace function public.can_access_treatment_file_treatment(target_tratamiento_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.treatments
    join public.patients on patients.id = treatments.patient_id
    join public.workspaces on workspaces.id = treatments.workspace_id
    where treatments.id = target_tratamiento_id
      and (
        exists (
          select 1
          from public.workspace_members
          where workspace_members.workspace_id = treatments.workspace_id
            and workspace_members.user_id = auth.uid()
            and workspace_members.role = 'ADMIN'
            and workspace_members.status = 'accepted'
        )
        or (
          workspaces.type = 'PERSONAL'
          and workspaces.owner_id = auth.uid()
          and patients.owner_id = auth.uid()
          and treatments.owner_id = auth.uid()
          and patients.clinic_id is null
        )
        or (
          patients.clinic_id is not null
          and patients.assigned_professional_id = auth.uid()
          and exists (
            select 1
            from public.clinic_professionals
            where clinic_professionals.clinic_id = patients.clinic_id
              and clinic_professionals.professional_id = auth.uid()
              and clinic_professionals.status in ('accepted', 'active')
              and clinic_professionals.can_view_assigned_patients
          )
        )
        or exists (
          select 1
          from public.patient_assignments
          join public.clinic_professionals
            on clinic_professionals.clinic_id = patients.clinic_id
            and clinic_professionals.professional_id = patient_assignments.professional_id
            and clinic_professionals.status in ('accepted', 'active')
            and clinic_professionals.can_view_assigned_patients
          where patient_assignments.workspace_id = treatments.workspace_id
            and patient_assignments.patient_id = treatments.patient_id
            and patient_assignments.professional_id = auth.uid()
            and patient_assignments.ended_at is null
        )
      )
  );
$function$;

create or replace function public.can_admin_treatment_file_treatment(target_tratamiento_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.treatments
    join public.workspace_members
      on workspace_members.workspace_id = treatments.workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.role = 'ADMIN'
      and workspace_members.status = 'accepted'
    where treatments.id = target_tratamiento_id
  );
$function$;

create or replace function public.can_insert_treatment_file(
  target_tratamiento_id uuid,
  target_paciente_id uuid,
  target_clinica_id uuid,
  target_subido_por uuid
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select target_subido_por = auth.uid()
    and exists (
      select 1
      from public.treatments
      join public.patients on patients.id = treatments.patient_id
      where treatments.id = target_tratamiento_id
        and treatments.patient_id = target_paciente_id
        and patients.id = target_paciente_id
        and patients.clinic_id is not distinct from target_clinica_id
        and public.can_access_treatment_file_treatment(treatments.id)
    );
$function$;

create or replace function public.can_update_treatment_file(
  target_tratamiento_id uuid,
  target_subido_por uuid
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select target_subido_por = auth.uid()
    or exists (
      select 1
      from public.treatments
      where treatments.id = target_tratamiento_id
        and public.can_admin_treatment_file_treatment(treatments.id)
    );
$function$;

create or replace function public.can_delete_treatment_file(
  target_tratamiento_id uuid,
  target_subido_por uuid
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select target_subido_por = auth.uid()
    or exists (
      select 1
      from public.treatments
      join public.workspaces on workspaces.id = treatments.workspace_id
      where treatments.id = target_tratamiento_id
        and workspaces.type = 'CLINICA'
        and public.can_admin_treatment_file_treatment(treatments.id)
    );
$function$;

create or replace function public.can_insert_treatment_storage_object(target_storage_path text)
returns boolean
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  path_parts text[];
  target_clinica_id uuid;
  target_paciente_id uuid;
  target_tratamiento_id uuid;
  target_profesional_id uuid;
begin
  path_parts := string_to_array(target_storage_path, '/');

  if array_length(path_parts, 1) <> 7 then
    return false;
  end if;

  if path_parts[1] = 'clinicas'
    and path_parts[3] = 'pacientes'
    and path_parts[5] = 'tratamientos'
    and path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[6] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_clinica_id := path_parts[2]::uuid;
    target_paciente_id := path_parts[4]::uuid;
    target_tratamiento_id := path_parts[6]::uuid;

    return exists (
      select 1
      from public.treatments
      join public.patients on patients.id = treatments.patient_id
      join public.workspaces on workspaces.id = treatments.workspace_id
      where treatments.id = target_tratamiento_id
        and treatments.patient_id = target_paciente_id
        and patients.id = target_paciente_id
        and patients.clinic_id = target_clinica_id
        and workspaces.type = 'CLINICA'
        and workspaces.source_clinic_id = target_clinica_id
        and public.can_access_treatment_file_treatment(treatments.id)
    );
  end if;

  if path_parts[1] = 'profesionales'
    and path_parts[3] = 'pacientes'
    and path_parts[5] = 'tratamientos'
    and path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[6] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_profesional_id := path_parts[2]::uuid;
    target_paciente_id := path_parts[4]::uuid;
    target_tratamiento_id := path_parts[6]::uuid;

    return target_profesional_id = auth.uid()
      and exists (
        select 1
        from public.treatments
        join public.patients on patients.id = treatments.patient_id
        join public.workspaces on workspaces.id = treatments.workspace_id
        where treatments.id = target_tratamiento_id
          and treatments.patient_id = target_paciente_id
          and patients.id = target_paciente_id
          and patients.clinic_id is null
          and patients.owner_id = auth.uid()
          and treatments.owner_id = auth.uid()
          and workspaces.type = 'PERSONAL'
          and workspaces.owner_id = auth.uid()
          and public.can_access_treatment_file_treatment(treatments.id)
      );
  end if;

  return false;
end;
$function$;

create or replace function public.can_select_treatment_storage_object(target_storage_path text)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.tratamiento_archivos
    where tratamiento_archivos.storage_path = target_storage_path
      and public.can_access_treatment_file_treatment(tratamiento_archivos.tratamiento_id)
  );
$function$;

create or replace function public.can_delete_treatment_storage_object(target_storage_path text)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.tratamiento_archivos
    where tratamiento_archivos.storage_path = target_storage_path
      and public.can_delete_treatment_file(
        tratamiento_archivos.tratamiento_id,
        tratamiento_archivos.subido_por
      )
  );
$function$;

alter table public.tratamiento_archivos enable row level security;

drop policy if exists "Treatment files read access"
on public.tratamiento_archivos;
create policy "Treatment files read access"
on public.tratamiento_archivos for select
to authenticated
using (public.can_access_treatment_file_treatment(tratamiento_id));

drop policy if exists "Treatment files insert access"
on public.tratamiento_archivos;
create policy "Treatment files insert access"
on public.tratamiento_archivos for insert
to authenticated
with check (
  public.can_insert_treatment_file(
    tratamiento_id,
    paciente_id,
    clinica_id,
    subido_por
  )
);

drop policy if exists "Treatment files update access"
on public.tratamiento_archivos;
create policy "Treatment files update access"
on public.tratamiento_archivos for update
to authenticated
using (public.can_update_treatment_file(tratamiento_id, subido_por))
with check (public.can_update_treatment_file(tratamiento_id, subido_por));

drop policy if exists "Treatment files delete access"
on public.tratamiento_archivos;
create policy "Treatment files delete access"
on public.tratamiento_archivos for delete
to authenticated
using (public.can_delete_treatment_file(tratamiento_id, subido_por));

drop policy if exists "Treatment storage insert access"
on storage.objects;
create policy "Treatment storage insert access"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'tratamiento-archivos'
  and lower(coalesce(metadata->>'mimetype', '')) in (
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  )
  and public.can_insert_treatment_storage_object(name)
);

drop policy if exists "Treatment storage read access"
on storage.objects;
create policy "Treatment storage read access"
on storage.objects for select
to authenticated
using (
  bucket_id = 'tratamiento-archivos'
  and public.can_select_treatment_storage_object(name)
);

drop policy if exists "Treatment storage delete access"
on storage.objects;
create policy "Treatment storage delete access"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'tratamiento-archivos'
  and public.can_delete_treatment_storage_object(name)
);
