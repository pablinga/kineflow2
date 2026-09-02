create or replace function public.can_manage_appointment_signature_storage_object(
  target_storage_path text
)
returns boolean
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  path_parts text[];
  target_appointment_id uuid;
  target_patient_id uuid;
begin
  path_parts := string_to_array(target_storage_path, '/');

  if array_length(path_parts, 1) <> 7 or path_parts[7] <> 'firma.png' then
    return false;
  end if;

  if path_parts[1] = 'clinicas'
    and path_parts[3] = 'pacientes'
    and path_parts[5] = 'turnos'
    and path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[6] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_patient_id := path_parts[4]::uuid;
    target_appointment_id := path_parts[6]::uuid;

    return exists (
      select 1
      from public.appointments
      where appointments.id = target_appointment_id
        and appointments.patient_id = target_patient_id
        and appointments.clinic_id::text = path_parts[2]
        and public.can_manage_workspace_appointment(appointments.id)
    );
  end if;

  if path_parts[1] = 'profesionales'
    and path_parts[3] = 'pacientes'
    and path_parts[5] = 'turnos'
    and path_parts[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and path_parts[6] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    target_patient_id := path_parts[4]::uuid;
    target_appointment_id := path_parts[6]::uuid;

    return path_parts[2] = auth.uid()::text
      and exists (
        select 1
        from public.appointments
        where appointments.id = target_appointment_id
          and appointments.patient_id = target_patient_id
          and appointments.owner_id::text = path_parts[2]
          and public.can_manage_workspace_appointment(appointments.id)
      );
  end if;

  return false;
end;
$function$;

drop policy if exists "Appointment signature storage insert access" on storage.objects;
create policy "Appointment signature storage insert access"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'firmas-turnos'
  and lower(coalesce(metadata->>'mimetype', '')) = 'image/png'
  and public.can_manage_appointment_signature_storage_object(name)
);

drop policy if exists "Appointment signature storage update access" on storage.objects;
create policy "Appointment signature storage update access"
on storage.objects for update
to authenticated
using (
  bucket_id = 'firmas-turnos'
  and public.can_manage_appointment_signature_storage_object(name)
)
with check (
  bucket_id = 'firmas-turnos'
  and lower(coalesce(metadata->>'mimetype', '')) = 'image/png'
  and public.can_manage_appointment_signature_storage_object(name)
);

drop policy if exists "Appointment signature storage read access" on storage.objects;
create policy "Appointment signature storage read access"
on storage.objects for select
to authenticated
using (
  bucket_id = 'firmas-turnos'
  and public.can_manage_appointment_signature_storage_object(name)
);

drop policy if exists "Appointment signature storage delete access" on storage.objects;
create policy "Appointment signature storage delete access"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'firmas-turnos'
  and public.can_manage_appointment_signature_storage_object(name)
);
