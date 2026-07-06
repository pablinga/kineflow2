alter table public.patients
  add column if not exists assigned_professional_id uuid null references auth.users(id) on delete set null;

create index if not exists patients_assigned_professional_id_idx
  on public.patients using btree (assigned_professional_id);

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
