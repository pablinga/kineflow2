alter table public.patients
  add column if not exists assigned_professional_id uuid null references auth.users(id) on delete set null;

create index if not exists patients_assigned_professional_id_idx
  on public.patients using btree (assigned_professional_id);

create index if not exists patients_clinic_assigned_professional_idx
  on public.patients(clinic_id, assigned_professional_id)
  where clinic_id is not null;

update public.patients
set assigned_professional_id = active_assignments.professional_id
from (
  select distinct on (patient_assignments.patient_id)
    patient_assignments.patient_id,
    patient_assignments.professional_id
  from public.patient_assignments
  where patient_assignments.ended_at is null
  order by patient_assignments.patient_id, patient_assignments.assigned_at desc
) as active_assignments
where patients.id = active_assignments.patient_id
  and patients.assigned_professional_id is null;

create or replace function public.is_patient_assigned_to_user(target_patient_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    join public.clinic_professionals
      on clinic_professionals.clinic_id = patients.clinic_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
      and clinic_professionals.can_view_assigned_patients
    where patients.id = target_patient_id
      and patients.clinic_id is not null
      and patients.assigned_professional_id = auth.uid()
  )
  or exists (
    select 1
    from public.patient_assignments
    join public.patients on patients.id = patient_assignments.patient_id
    join public.clinic_professionals
      on clinic_professionals.clinic_id = patients.clinic_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
      and clinic_professionals.can_view_assigned_patients
    where patient_assignments.patient_id = target_patient_id
      and patient_assignments.professional_id = auth.uid()
      and patient_assignments.ended_at is null
      and patient_assignments.workspace_id = patients.workspace_id
  );
$function$;

create or replace function public.can_access_workspace_patient(target_patient_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    join public.workspaces on workspaces.id = patients.workspace_id
    where patients.id = target_patient_id
      and (
        public.is_workspace_admin(patients.workspace_id)
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

create or replace function public.sync_patient_assigned_professional()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  next_professional_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.ended_at is null then
      update public.patients
      set assigned_professional_id = new.professional_id
      where patients.id = new.patient_id;
    end if;

    return new;
  end if;

  if new.ended_at is null then
    update public.patients
    set assigned_professional_id = new.professional_id
    where patients.id = new.patient_id;

    return new;
  end if;

  select patient_assignments.professional_id
    into next_professional_id
  from public.patient_assignments
  where patient_assignments.patient_id = new.patient_id
    and patient_assignments.ended_at is null
    and patient_assignments.id <> new.id
  order by patient_assignments.assigned_at desc
  limit 1;

  update public.patients
  set assigned_professional_id = next_professional_id
  where patients.id = new.patient_id
    and patients.assigned_professional_id = new.professional_id;

  return new;
end;
$function$;

drop trigger if exists sync_patient_assigned_professional on public.patient_assignments;
create trigger sync_patient_assigned_professional
after insert or update of professional_id, ended_at on public.patient_assignments
for each row execute function public.sync_patient_assigned_professional();

create or replace function public.get_workspace_patient_limit_block_message(target_workspace_id uuid)
returns text
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  patient_limit integer;
  active_patients integer;
begin
  patient_limit := public.get_workspace_patient_limit(target_workspace_id);

  if patient_limit is null or patient_limit < 0 then
    return null;
  end if;

  select count(*)
    into active_patients
  from public.patients
  where patients.workspace_id = target_workspace_id
    and patients.clinic_id is null
    and patients.status = 'active';

  if active_patients >= patient_limit then
    return format(
      'Tu plan Free permite hasta %s pacientes activos. Tenes %s pacientes activos.',
      patient_limit,
      active_patients
    );
  end if;

  return null;
end;
$function$;

create or replace function public.enforce_patient_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  patient_limit integer;
  active_patients integer;
begin
  if new.workspace_id is null and new.clinic_id is not null then
    new.workspace_id := public.get_clinic_workspace_id(new.clinic_id);
  end if;

  if new.workspace_id is null then
    new.workspace_id := public.get_personal_workspace_id(new.owner_id);
  end if;

  if new.workspace_id is null then
    return new;
  end if;

  if new.clinic_id is not null then
    return new;
  end if;

  patient_limit := public.get_workspace_patient_limit(new.workspace_id);

  if patient_limit is not null and patient_limit >= 0 then
    select count(*)
      into active_patients
    from public.patients
    where patients.workspace_id = new.workspace_id
      and patients.clinic_id is null
      and patients.status = 'active';

    if active_patients >= patient_limit then
      raise exception 'Tu plan Free permite hasta % pacientes activos. Tenes % pacientes activos.',
        patient_limit,
        active_patients;
    end if;
  end if;

  return new;
end;
$function$;
