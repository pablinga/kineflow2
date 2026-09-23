-- Kinesiólogo que atiende en una clínica, desde su espacio particular:
-- 1) Puede leer los pacientes de sus propios turnos de clínica (antes solo los
--    que tenía asignados; un turno con un paciente no asignado aparecía sin
--    nombre en su agenda).
-- 2) Puede registrar la evolución de esos pacientes solo si la clínica lo
--    habilitó (clinic_professionals.can_register_evolutions), que hasta ahora
--    se guardaba pero no se aplicaba.
-- 3) Puede leer las evoluciones que registró él sobre esos pacientes.
-- En todos los casos se exige el vínculo activo con la clínica.

create or replace function public.has_active_clinic_appointment_with_patient(
  target_patient_id uuid
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.appointments
    join public.clinic_professionals
      on clinic_professionals.id = appointments.clinic_professional_id
    where appointments.patient_id = target_patient_id
      and appointments.appointment_origin = 'clinic'
      and appointments.owner_id = auth.uid()
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'active'
  );
$function$;

grant execute on function public.has_active_clinic_appointment_with_patient(uuid)
  to authenticated;

drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients"
  on public.patients
  for select
  to authenticated
  using (
    public.is_workspace_admin(workspace_id)
    or public.can_access_workspace_patient(id)
    or public.has_active_clinic_appointment_with_patient(id)
  );

create or replace function public.can_insert_workspace_evolution(
  target_workspace_id uuid,
  target_owner_id uuid,
  target_patient_id uuid,
  target_appointment_id uuid
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    where patients.id = target_patient_id
      and patients.workspace_id = target_workspace_id
      and patients.status = 'active'
      and target_owner_id = auth.uid()
      and (
        public.is_workspace_admin(target_workspace_id)
        or (
          (
            public.is_patient_assigned_to_user(target_patient_id)
            or exists (
              select 1
              from public.appointments
              where appointments.id = target_appointment_id
                and appointments.patient_id = target_patient_id
                and appointments.workspace_id = target_workspace_id
                and appointments.owner_id = auth.uid()
            )
          )
          and (
            patients.clinic_id is null
            or exists (
              select 1
              from public.clinic_professionals
              where clinic_professionals.clinic_id = patients.clinic_id
                and clinic_professionals.professional_id = auth.uid()
                and clinic_professionals.status = 'active'
                and clinic_professionals.can_register_evolutions
            )
          )
        )
      )
  );
$function$;

drop policy if exists "Users can read own evolutions" on public.evolutions;
create policy "Users can read own evolutions"
  on public.evolutions
  for select
  to authenticated
  using (
    public.can_access_workspace_patient(patient_id)
    or (
      owner_id = auth.uid()
      and public.has_active_clinic_appointment_with_patient(patient_id)
    )
  );
