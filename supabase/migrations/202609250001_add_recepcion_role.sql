-- Rol RECEPCION para workspaces CLINICA: lo mismo que ADMIN sobre pacientes y
-- turnos (incluido borrar, cobrar y firmar), pero evoluciones/tratamientos/
-- archivos solo en lectura, y sin acceso a Configuración, Reportes, Ingresos ni
-- Equipo (eso lo resuelve la UI). No es profesional (no está en
-- clinic_professionals). Los DELETE de patients/appointments siguen usando
-- can_manage_workspace_patient / can_manage_workspace_appointment (3c/3d).
--
-- Las funciones 3a-3f parten de la definición LIVE de QA (idénticas a prod
-- salvo finales de línea). 3g parte de la definición LIVE de prod: en QA esa
-- función no existe (drift) y la lectura de archivos usa
-- can_access_workspace_treatment -> can_access_workspace_patient (3a).

begin;

-- 1. Rol
alter table public.workspace_members drop constraint workspace_members_role_check;
alter table public.workspace_members add constraint workspace_members_role_check
  check (role in ('ADMIN', 'KINESIOLOGO', 'RECEPCION'));

-- 2. Helper staff (ADMIN, o RECEPCION solo en CLINICA)
create or replace function public.is_workspace_staff(target_workspace_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.workspace_members
    join public.workspaces on workspaces.id = workspace_members.workspace_id
    where workspace_members.workspace_id = target_workspace_id
      and workspace_members.user_id = auth.uid()
      and workspace_members.status = 'accepted'
      and (
        workspace_members.role = 'ADMIN'
        or (workspace_members.role = 'RECEPCION' and workspaces.type = 'CLINICA')
      )
  );
$function$;

-- 3a. can_access_workspace_patient
CREATE OR REPLACE FUNCTION public.can_access_workspace_patient(target_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.patients
    join public.workspaces on workspaces.id = patients.workspace_id
    where patients.id = target_patient_id
      and (
        public.is_workspace_staff(patients.workspace_id)
        or (
          workspaces.type = 'PERSONAL'
          and workspaces.owner_id = auth.uid()
          and patients.owner_id = auth.uid()
          and patients.clinic_id is null
        )
        or public.is_patient_assigned_to_user(patients.id)
      )
  );
$function$;

-- 3b. can_access_workspace_appointment
CREATE OR REPLACE FUNCTION public.can_access_workspace_appointment(target_appointment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.appointments
    where appointments.id = target_appointment_id
      and (
        public.is_workspace_staff(appointments.workspace_id)
        or (
          appointments.owner_id = auth.uid()
          and public.is_workspace_member(appointments.workspace_id)
        )
        or public.can_access_workspace_patient(appointments.patient_id)
      )
  );
$function$;

-- 3c. can_manage_workspace_appointment
CREATE OR REPLACE FUNCTION public.can_manage_workspace_appointment(target_appointment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.appointments
    join public.workspaces on workspaces.id = appointments.workspace_id
    where appointments.id = target_appointment_id
      and (
        public.is_workspace_staff(appointments.workspace_id)
        or (
          workspaces.type = 'PERSONAL'
          and appointments.owner_id = auth.uid()
        )
      )
  );
$function$;

-- 3d. can_manage_workspace_patient
CREATE OR REPLACE FUNCTION public.can_manage_workspace_patient(target_patient_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.patients
    where patients.id = target_patient_id
      and public.is_workspace_staff(patients.workspace_id)
  );
$function$;

-- 3e. can_insert_workspace_appointment (solo la rama CLINICA pasa a staff)
CREATE OR REPLACE FUNCTION public.can_insert_workspace_appointment(target_workspace_id uuid, target_owner_id uuid, target_patient_id uuid, target_clinic_id uuid, target_clinic_professional_id uuid, target_origin text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspaces
    join public.patients
      on patients.id = target_patient_id
      and patients.workspace_id = workspaces.id
      and patients.status = 'active'
    where workspaces.id = target_workspace_id
      and (
        (
          workspaces.type = 'PERSONAL'
          and target_origin = 'independent'
          and target_clinic_id is null
          and target_clinic_professional_id is null
          and workspaces.owner_id = auth.uid()
          and target_owner_id = auth.uid()
          and public.is_workspace_admin(workspaces.id)
        )
        or (
          workspaces.type = 'CLINICA'
          and target_origin = 'clinic'
          and workspaces.source_clinic_id = target_clinic_id
          and public.is_workspace_staff(workspaces.id)
          and exists (
            select 1
            from public.workspace_members
            where workspace_members.workspace_id = workspaces.id
              and workspace_members.user_id = target_owner_id
              and workspace_members.role = 'KINESIOLOGO'
              and workspace_members.status = 'accepted'
          )
          and exists (
            select 1
            from public.clinic_professionals
            where clinic_professionals.id = target_clinic_professional_id
              and clinic_professionals.clinic_id = target_clinic_id
              and clinic_professionals.professional_id = target_owner_id
              and clinic_professionals.status = 'active'
          )
        )
      )
  );
$function$;

-- 3f. can_insert_workspace_patient (PERSONAL sigue con admin, CLINICA pasa a staff)
CREATE OR REPLACE FUNCTION public.can_insert_workspace_patient(target_workspace_id uuid, target_owner_id uuid, target_clinic_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.workspaces
    where workspaces.id = target_workspace_id
      and (
        (
          workspaces.type = 'PERSONAL'
          and public.is_workspace_admin(workspaces.id)
          and workspaces.owner_id = auth.uid()
          and target_owner_id = auth.uid()
          and target_clinic_id is null
        )
        or (
          workspaces.type = 'CLINICA'
          and public.is_workspace_staff(workspaces.id)
          and workspaces.source_clinic_id = target_clinic_id
        )
      )
  );
$function$;

-- 3g. can_access_treatment_file_treatment (definición live de prod)
CREATE OR REPLACE FUNCTION public.can_access_treatment_file_treatment(target_tratamiento_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            and workspace_members.role in ('ADMIN', 'RECEPCION')
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

-- 4. Policies

-- 4a. patients SELECT
drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients"
  on public.patients
  for select
  to authenticated
  using (
    public.is_workspace_staff(workspace_id)
    or public.can_access_workspace_patient(id)
    or public.has_active_clinic_appointment_with_patient(id)
  );

-- 4c. appointments SELECT
drop policy if exists "Users can read own appointments" on public.appointments;
create policy "Users can read own appointments"
  on public.appointments
  for select
  to authenticated
  using (
    public.is_workspace_staff(workspace_id)
    or (
      owner_id = auth.uid()
      and public.is_workspace_member(workspace_id)
    )
    or public.can_access_workspace_appointment(id)
  );

-- 4d. patient_assignments (ALL)
drop policy if exists "Admins can manage patient assignments" on public.patient_assignments;
create policy "Admins can manage patient assignments"
  on public.patient_assignments
  for all
  to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

-- 4e. clinic_professionals SELECT para staff
drop policy if exists "Workspace staff can read professionals" on public.clinic_professionals;
create policy "Workspace staff can read professionals"
  on public.clinic_professionals
  for select
  to authenticated
  using (public.is_workspace_staff(public.get_clinic_workspace_id(clinic_id)));

-- 4f. clinic_professional_availability SELECT para staff
drop policy if exists "Workspace staff can read availability" on public.clinic_professional_availability;
create policy "Workspace staff can read availability"
  on public.clinic_professional_availability
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clinic_professionals
      where clinic_professionals.id = clinic_professional_availability.clinic_professional_id
        and public.is_workspace_staff(public.get_clinic_workspace_id(clinic_professionals.clinic_id))
    )
  );

-- 4g. clinic_professional_availability_exceptions SELECT para staff
drop policy if exists "Workspace staff can read availability exceptions" on public.clinic_professional_availability_exceptions;
create policy "Workspace staff can read availability exceptions"
  on public.clinic_professional_availability_exceptions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clinic_professionals
      where clinic_professionals.id = clinic_professional_availability_exceptions.clinic_professional_id
        and public.is_workspace_staff(public.get_clinic_workspace_id(clinic_professionals.clinic_id))
    )
  );

-- 4h. insurance_providers / art_providers: lectura para miembros, escritura solo ADMIN
drop policy if exists "Workspace members can manage insurance providers" on public.insurance_providers;
drop policy if exists "Workspace members can read insurance providers" on public.insurance_providers;
create policy "Workspace members can read insurance providers"
  on public.insurance_providers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members
      where workspace_members.workspace_id = insurance_providers.workspace_id
        and workspace_members.user_id = auth.uid()
        and workspace_members.status = 'accepted'
    )
  );
drop policy if exists "Workspace admins can manage insurance providers" on public.insurance_providers;
create policy "Workspace admins can manage insurance providers"
  on public.insurance_providers
  for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "Workspace members can manage ART providers" on public.art_providers;
drop policy if exists "Workspace members can read ART providers" on public.art_providers;
create policy "Workspace members can read ART providers"
  on public.art_providers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members
      where workspace_members.workspace_id = art_providers.workspace_id
        and workspace_members.user_id = auth.uid()
        and workspace_members.status = 'accepted'
    )
  );
drop policy if exists "Workspace admins can manage ART providers" on public.art_providers;
create policy "Workspace admins can manage ART providers"
  on public.art_providers
  for all
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- 4j. subscriptions SELECT: el staff lee la suscripción de su workspace para que
--     la UI evalúe el plan real de la clínica (RECEPCION no ve la pantalla de
--     Plan; solo se usa para los chequeos de límites). Antes: solo ADMIN.
drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
  on public.subscriptions
  for select
  to authenticated
  using (
    account_id = auth.uid()
    or (
      workspace_id is not null
      and public.is_workspace_staff(workspace_id)
    )
  );

-- 4k. profiles SELECT: el staff de una clínica lee el perfil (nombre, matrícula)
--     de los profesionales vinculados a esa clínica, para los selectores y la
--     agenda. Policy nueva y aditiva: no toca "Clinics can search
--     kinesiologists", que difiere entre QA y prod.
drop policy if exists "Workspace staff can read clinic professional profiles" on public.profiles;
create policy "Workspace staff can read clinic professional profiles"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.clinic_professionals
      where clinic_professionals.professional_id = profiles.id
        and public.is_workspace_staff(public.get_clinic_workspace_id(clinic_professionals.clinic_id))
    )
  );

-- 5. sync_clinic_professional_workspace_member (definición live): el UPDATE por
--    email no pisa una membresía RECEPCION si esa persona también se vincula
--    como profesional con el mismo email.
CREATE OR REPLACE FUNCTION public.sync_clinic_professional_workspace_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  target_workspace_id uuid;
  clinic_owner_id uuid;
  member_status text;
begin
  select workspaces.id, clinics.owner_id
    into target_workspace_id, clinic_owner_id
  from public.clinics
  join public.workspaces on workspaces.source_clinic_id = clinics.id
  where clinics.id = new.clinic_id
  limit 1;

  if target_workspace_id is null then
    return new;
  end if;

  member_status := case
    when new.status = 'active' then 'accepted'
    else new.status
  end;

  insert into public.workspace_members (
    workspace_id,
    user_id,
    email,
    role,
    status,
    invited_by,
    invited_at,
    responded_at,
    color,
    can_register_evolutions,
    can_view_assigned_patients,
    source_clinic_professional_id
  )
  values (
    target_workspace_id,
    new.professional_id,
    lower(trim(new.professional_email)),
    case when upper(new.role) = 'ADMIN' then 'ADMIN' else 'KINESIOLOGO' end,
    member_status,
    clinic_owner_id,
    new.invited_at,
    new.responded_at,
    new.color,
    new.can_register_evolutions,
    new.can_view_assigned_patients,
    new.id
  )
  on conflict do nothing;

  update public.workspace_members
  set
    user_id = new.professional_id,
    role = case when upper(new.role) = 'ADMIN' then 'ADMIN' else 'KINESIOLOGO' end,
    status = member_status,
    responded_at = new.responded_at,
    color = new.color,
    can_register_evolutions = new.can_register_evolutions,
    can_view_assigned_patients = new.can_view_assigned_patients,
    source_clinic_professional_id = new.id,
    updated_at = now()
  where workspace_id = target_workspace_id
    and email = lower(trim(new.professional_email))
    and role <> 'RECEPCION';

  return new;
end;
$function$;

commit;
