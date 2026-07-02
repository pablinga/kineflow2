create or replace function public.get_workspace_patient_limit(target_workspace_id uuid)
returns integer
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  patient_limit integer;
begin
  select plans.max_patients
    into patient_limit
  from public.subscriptions
  join public.plans on plans.id = subscriptions.plan_id
  where subscriptions.workspace_id = target_workspace_id
    and subscriptions.status = 'ACTIVE'
  order by subscriptions.created_at desc
  limit 1;

  if patient_limit is not null then
    return patient_limit;
  end if;

  select plans.max_patients
    into patient_limit
  from public.plans
  where plans.code = 'FREE'
  limit 1;

  return coalesce(patient_limit, 5);
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

  patient_limit := public.get_workspace_patient_limit(new.workspace_id);

  if patient_limit is not null and patient_limit >= 0 then
    select count(*)
      into active_patients
    from public.patients
    where patients.workspace_id = new.workspace_id
      and patients.status = 'active';

    if active_patients >= patient_limit then
      raise exception 'Tu plan Free permite hasta % pacientes activos por espacio de trabajo. Tenes % pacientes activos.',
        patient_limit,
        active_patients;
    end if;
  end if;

  return new;
end;
$function$;
