drop trigger if exists set_default_plan_values on public.profiles;
drop trigger if exists prevent_profile_billing_self_update on public.profiles;
drop function if exists public.set_default_plan_values();
drop function if exists public.prevent_profile_billing_self_update();

create or replace function public.has_active_paid_plan(required_plan text default null)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.subscriptions
    join public.plans on plans.id = subscriptions.plan_id
    where subscriptions.account_id = auth.uid()
      and subscriptions.status = 'ACTIVE'
      and plans.code <> 'FREE'
      and (required_plan is null or plans.code = required_plan)
  );
$function$;

create or replace function public.can_create_independent_practice_records()
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.account_type = 'KINESIOLOGO'
  )
  and (
    not exists (
      select 1
      from public.subscriptions
      where subscriptions.account_id = auth.uid()
    )
    or exists (
      select 1
      from public.subscriptions
      join public.plans on plans.id = subscriptions.plan_id
      where subscriptions.account_id = auth.uid()
        and (
          subscriptions.status <> 'ACTIVE'
          or plans.code in ('FREE', 'INDEPENDIENTE')
        )
    )
  );
$function$;

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
  limit 1;

  current_plan := coalesce(current_plan, 'FREE');
  current_status := coalesce(current_status, 'FREE');
  patient_limit := coalesce(patient_limit, 5);

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

    if active_patients >= patient_limit then
      raise exception 'El Plan Free permite hasta 5 pacientes. Para seguir agregando pacientes, activa KineFlow - Particular.';
    end if;

    return new;
  end if;

  raise exception 'Tu plan no permite crear pacientes.';
end;
$function$;

drop trigger if exists enforce_patient_plan_limit on public.patients;
create trigger enforce_patient_plan_limit
before insert on public.patients
for each row execute function public.enforce_patient_plan_limit();
