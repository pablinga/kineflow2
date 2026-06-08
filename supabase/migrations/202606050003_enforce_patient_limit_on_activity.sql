create or replace function public.get_account_patient_limit(target_account_id uuid)
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
  where subscriptions.account_id = target_account_id
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

create or replace function public.get_patient_limit_block_message(target_account_id uuid)
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
  patient_limit := public.get_account_patient_limit(target_account_id);

  if patient_limit is null or patient_limit < 0 then
    return null;
  end if;

  select count(*)
    into active_patients
  from public.patients
  where patients.owner_id = target_account_id
    and patients.clinic_id is null
    and patients.status = 'active';

  if active_patients > patient_limit then
    return format(
      'Tu plan Free permite hasta %s pacientes activos. Tenés %s pacientes. Archivá pacientes o reactivá tu plan para continuar.',
      patient_limit,
      active_patients
    );
  end if;

  return null;
end;
$function$;

create or replace function public.enforce_patient_activity_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  block_message text;
begin
  if tg_table_name = 'appointments'
    and (new.clinic_id is not null or new.appointment_origin = 'clinic') then
    return new;
  end if;

  block_message := public.get_patient_limit_block_message(new.owner_id);

  if block_message is not null then
    raise exception '%', block_message;
  end if;

  return new;
end;
$function$;

drop trigger if exists enforce_appointment_patient_limit on public.appointments;
create trigger enforce_appointment_patient_limit
before insert on public.appointments
for each row execute function public.enforce_patient_activity_plan_limit();

drop trigger if exists enforce_evolution_patient_limit on public.evolutions;
create trigger enforce_evolution_patient_limit
before insert on public.evolutions
for each row execute function public.enforce_patient_activity_plan_limit();

create or replace function public.enforce_patient_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_plan text := 'FREE';
  current_status text := 'FREE';
  current_account_type text;
  patient_limit integer := 5;
  active_patients integer;
begin
  select profiles.account_type
    into current_account_type
  from public.profiles
  where profiles.id = new.owner_id;

  select plans.code, subscriptions.status, plans.max_patients
    into current_plan, current_status, patient_limit
  from public.subscriptions
  join public.plans on plans.id = subscriptions.plan_id
  where subscriptions.account_id = new.owner_id
    and subscriptions.status = 'ACTIVE'
  order by subscriptions.created_at desc
  limit 1;

  current_plan := coalesce(current_plan, 'FREE');
  current_status := coalesce(current_status, 'FREE');
  patient_limit := coalesce(patient_limit, public.get_account_patient_limit(new.owner_id));

  if current_account_type = 'CONSULTORIO' then
    if new.clinic_id is null
      or current_status <> 'ACTIVE'
      or current_plan not in ('CONSULTORIO_2', 'CONSULTORIO_5', 'CONSULTORIO_10') then
      raise exception 'Para gestionar pacientes del consultorio necesitas una suscripción activa del Plan Consultorio.';
    end if;

    return new;
  end if;

  if coalesce(current_account_type, 'KINESIOLOGO') = 'KINESIOLOGO' then
    if new.clinic_id is not null then
      return new;
    end if;

    if current_status = 'ACTIVE' and current_plan = 'INDEPENDIENTE' then
      return new;
    end if;

    select count(*)
      into active_patients
    from public.patients
    where owner_id = new.owner_id
      and clinic_id is null
      and status = 'active';

    if patient_limit is not null
      and patient_limit >= 0
      and active_patients >= patient_limit then
      raise exception 'Tu plan Free permite hasta % pacientes activos. Tenés % pacientes. Archivá pacientes o reactivá tu plan para continuar.',
        patient_limit,
        active_patients;
    end if;

    return new;
  end if;

  raise exception 'Tu plan no permite crear pacientes.';
end;
$function$;
