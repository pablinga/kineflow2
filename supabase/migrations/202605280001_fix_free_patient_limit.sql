create or replace function public.enforce_patient_plan_limit()
returns trigger
as $function$
declare
  current_plan text;
  current_status text;
  current_account_type text;
  patient_limit integer;
  active_patients integer;
begin
  select profiles.plan,
    profiles.estado_plan,
    profiles.account_type,
    profiles.limite_pacientes
    into current_plan, current_status, current_account_type, patient_limit
  from public.profiles
  where profiles.id = new.owner_id;

  if current_account_type = 'CONSULTORIO' then
    if new.clinic_id is null
      or coalesce(current_status, 'ACTIVO') <> 'ACTIVO'
      or coalesce(current_plan, 'FREE') not in ('CONSULTORIO_2', 'CONSULTORIO_5', 'CONSULTORIO_10') then
      raise exception 'Para gestionar pacientes del consultorio necesitas una suscripcion activa del Plan Consultorio.';
    end if;

    return new;
  end if;

  if coalesce(current_account_type, 'KINESIOLOGO') = 'KINESIOLOGO' then
    if new.clinic_id is not null then
      return new;
    end if;

    if coalesce(current_plan, 'FREE') = 'INDEPENDIENTE' then
      return new;
    end if;

    if coalesce(current_plan, 'FREE') = 'FREE' then
      select count(*)
        into active_patients
      from public.patients
      where owner_id = new.owner_id
        and clinic_id is null
        and status = 'active';

      if active_patients >= coalesce(patient_limit, 5) then
        raise exception 'El Plan Free permite hasta 5 pacientes. Para seguir agregando pacientes, activa KineFlow - Particular.';
      end if;

      return new;
    end if;
  end if;

  raise exception 'Tu plan no permite crear pacientes.';
end;
$function$ language plpgsql security definer set search_path = public;

drop trigger if exists enforce_patient_plan_limit on public.patients;
create trigger enforce_patient_plan_limit
before insert on public.patients
for each row execute function public.enforce_patient_plan_limit();

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
      and (
        profiles.plan = 'FREE'
        or profiles.plan = 'INDEPENDIENTE'
      )
      and profiles.estado_plan in ('ACTIVO', 'PENDIENTE')
  );
$function$;
