alter table public.profiles
  add column if not exists plan text not null default 'FREE',
  add column if not exists estado_plan text not null default 'ACTIVO',
  add column if not exists limite_pacientes integer not null default 5,
  add column if not exists cantidad_kinesiologos integer not null default 1;

alter table public.profiles
  drop constraint if exists profiles_plan_check,
  add constraint profiles_plan_check check (plan in ('FREE', 'INDEPENDIENTE', 'CLINICA'));

alter table public.profiles
  drop constraint if exists profiles_estado_plan_check,
  add constraint profiles_estado_plan_check check (estado_plan in ('ACTIVO', 'PENDIENTE', 'VENCIDO'));

alter table public.profiles
  drop constraint if exists profiles_plan_limits_check,
  add constraint profiles_plan_limits_check check (
    (plan = 'FREE' and limite_pacientes = 5 and cantidad_kinesiologos = 1)
    or (plan = 'INDEPENDIENTE' and limite_pacientes = -1 and cantidad_kinesiologos = 1)
    or (plan = 'CLINICA' and limite_pacientes = -1 and cantidad_kinesiologos >= 2)
  );

create or replace function public.set_default_plan_values()
returns trigger
as $function$
begin
  if new.plan = 'FREE' then
    new.limite_pacientes = 5;
    new.cantidad_kinesiologos = 1;
  elsif new.plan = 'INDEPENDIENTE' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = 1;
  elsif new.plan = 'CLINICA' then
    new.limite_pacientes = -1;
    new.cantidad_kinesiologos = greatest(coalesce(new.cantidad_kinesiologos, 2), 2);
  end if;

  return new;
end;
$function$ language plpgsql;

drop trigger if exists set_default_plan_values on public.profiles;
create trigger set_default_plan_values
before insert or update of plan, cantidad_kinesiologos on public.profiles
for each row execute function public.set_default_plan_values();

create or replace function public.enforce_patient_plan_limit()
returns trigger
as $function$
declare
  current_plan text;
  patient_limit integer;
  active_patients integer;
begin
  select profiles.plan, profiles.limite_pacientes
    into current_plan, patient_limit
  from public.profiles
  where profiles.id = new.owner_id;

  if coalesce(current_plan, 'FREE') = 'FREE' then
    select count(*)
      into active_patients
    from public.patients
    where owner_id = new.owner_id
      and status = 'active';

    if active_patients >= coalesce(patient_limit, 5) then
      raise exception 'El Plan Free permite hasta 5 pacientes. Para continuar, activa un plan pago.';
    end if;
  end if;

  return new;
end;
$function$ language plpgsql security definer set search_path = public;

drop trigger if exists enforce_patient_plan_limit on public.patients;
create trigger enforce_patient_plan_limit
before insert on public.patients
for each row execute function public.enforce_patient_plan_limit();
