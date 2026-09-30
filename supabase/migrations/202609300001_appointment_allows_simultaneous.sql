-- Cada turno indica si admite simultaneidad (allows_simultaneous).
--
-- Regla (turnos del mismo workspace y mismo owner que se superponen,
-- excluyendo cancelados y el propio turno):
-- 1. Turno nuevo NO simultáneo + algún superpuesto -> se rechaza.
-- 2. Turno nuevo simultáneo + algún superpuesto NO simultáneo -> se rechaza.
-- 3. Todos simultáneos -> se permite mientras superpuestos < cupo
--    (max_simultaneous_appointments, regla existente).
-- Superposición con otro workspace: se rechaza siempre (sin cambios).
--
-- Backfill: los turnos de CLINICA y de PERSONAL con cupo > 1 quedan como
-- simultáneos para no cambiar el comportamiento actual. El default "marcado"
-- de CLINICA para turnos nuevos lo aplica la app.
--
-- validate_appointment_schedule(): parte de 202609230005 (igual a la versión
-- live en QA y prod al 2026-09-30). Cambios: early-return de UPDATE
-- considera allows_simultaneous, y chequeos de exclusividad antes del cupo.

begin;

-- 1. Columna
alter table public.appointments
  add column if not exists allows_simultaneous boolean not null default false;

-- 2. Backfill (antes de recrear el trigger: allows_simultaneous todavía no
--    está en su lista de columnas, así que este update no lo dispara).
update public.appointments
set allows_simultaneous = true
from public.workspaces
where workspaces.id = appointments.workspace_id
  and (workspaces.type = 'CLINICA'
       or coalesce(workspaces.max_simultaneous_appointments, 1) > 1);

-- 3. Función
CREATE OR REPLACE FUNCTION public.validate_appointment_schedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  conflict_count integer;
  exclusive_conflict boolean;
  workspace_capacity integer;
  conflicting_record record;
  reserved_record record;
  availability_exists boolean;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  -- Cambiar solo el estado de un turno existente (asistió, no asistió,
  -- reprogramado) no vuelve a validar el horario: el turno ya pasó esa
  -- validación al crearse o moverse, y la disponibilidad de clínica pudo
  -- cargarse después. Sí se valida si cambia el horario/asignación o si se
  -- reactiva un turno cancelado.
  if tg_op = 'UPDATE'
    and old.status <> 'cancelled'
    and new.scheduled_at = old.scheduled_at
    and new.duration_minutes = old.duration_minutes
    and new.owner_id is not distinct from old.owner_id
    and new.clinic_id is not distinct from old.clinic_id
    and new.clinic_professional_id is not distinct from old.clinic_professional_id
    and new.appointment_origin is not distinct from old.appointment_origin
    and new.allows_simultaneous is not distinct from old.allows_simultaneous
  then
    return new;
  end if;

  new_end := new.scheduled_at + make_interval(mins => new.duration_minutes);
  local_start := timezone('America/Argentina/Buenos_Aires', new.scheduled_at);
  local_end := timezone('America/Argentina/Buenos_Aires', new_end);

  select coalesce(workspaces.max_simultaneous_appointments, 1)
  into workspace_capacity
  from public.workspaces
  where workspaces.id = new.workspace_id;

  workspace_capacity := coalesce(workspace_capacity, 1);

  -- Turnos que se superponen EN EL MISMO workspace: permitidos hasta el cupo,
  -- y solo si todos (el nuevo y los existentes) admiten simultaneidad.
  select count(*), bool_or(not appointments.allows_simultaneous)
  into conflict_count, exclusive_conflict
  from public.appointments
  where appointments.owner_id = new.owner_id
    and appointments.workspace_id = new.workspace_id
    and appointments.status <> 'cancelled'
    and appointments.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and appointments.scheduled_at < new_end
    and appointments.scheduled_at + make_interval(mins => appointments.duration_minutes) > new.scheduled_at;

  if conflict_count > 0 and not new.allows_simultaneous then
    raise exception using
      errcode = 'P0001',
      message = 'Ya hay un turno en ese horario. Si esta sesión se puede superponer, marcala como turno simultáneo.';
  end if;

  if conflict_count > 0 and coalesce(exclusive_conflict, false) then
    raise exception using
      errcode = 'P0001',
      message = 'En ese horario hay un turno que no admite simultáneos.';
  end if;

  if conflict_count >= workspace_capacity then
    raise exception using
      errcode = 'P0001',
      message = 'El kinesiólogo ya alcanzó el cupo de turnos simultáneos para ese horario.';
  end if;

  -- Turnos que se superponen en OTRO workspace: se sigue bloqueando siempre,
  -- el cupo de "simultáneos" solo aplica dentro del mismo consultorio.
  select appointments.scheduled_at,
    appointments.scheduled_at + make_interval(mins => appointments.duration_minutes) as ends_at,
    clinics.name as clinic_name
  into conflicting_record
  from public.appointments
  left join public.clinics on clinics.id = appointments.clinic_id
  where appointments.owner_id = new.owner_id
    and appointments.workspace_id is distinct from new.workspace_id
    and appointments.status <> 'cancelled'
    and appointments.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and appointments.scheduled_at < new_end
    and appointments.scheduled_at + make_interval(mins => appointments.duration_minutes) > new.scheduled_at
  order by appointments.scheduled_at
  limit 1;

  if found then
    raise exception using
      errcode = 'P0001',
      message = case
        when conflicting_record.clinic_name is not null then
          'El kinesiólogo ya tiene un turno de '
          || to_char(timezone('America/Argentina/Buenos_Aires', conflicting_record.scheduled_at), 'HH24:MI')
          || ' a '
          || to_char(timezone('America/Argentina/Buenos_Aires', conflicting_record.ends_at), 'HH24:MI')
          || ' en '
          || conflicting_record.clinic_name
          || '.'
        else
          'El kinesiólogo ya tiene un turno asignado en ese horario. Revisá la agenda antes de confirmar.'
      end;
  end if;

  if new.appointment_origin = 'independent' then
    select clinics.name
    into reserved_record
    from public.clinic_professional_availability availability
    join public.clinic_professionals
      on clinic_professionals.id = availability.clinic_professional_id
    join public.clinics on clinics.id = clinic_professionals.clinic_id
    where clinic_professionals.professional_id = new.owner_id
      and clinic_professionals.status = 'active'
      and availability.active
      and availability.weekday = extract(dow from local_start)::integer
      and (availability.valid_from is null or local_start::date >= availability.valid_from)
      and (availability.valid_to is null or local_start::date <= availability.valid_to)
      and local_start::time < availability.ends_at
      and local_end::time > availability.starts_at
    order by availability.starts_at
    limit 1;

    if found then
      raise exception using
        errcode = 'P0001',
        message = 'Este horario está reservado para '
          || reserved_record.name
          || '. En esta franja solo podés atender pacientes asignados por ese consultorio.';
    end if;
  else
    select exists (
      select 1
      from public.clinic_professional_availability availability
      join public.clinic_professionals
        on clinic_professionals.id = availability.clinic_professional_id
      where availability.clinic_professional_id = new.clinic_professional_id
        and clinic_professionals.clinic_id = new.clinic_id
        and clinic_professionals.professional_id = new.owner_id
        and clinic_professionals.status = 'active'
        and availability.active
        and availability.weekday = extract(dow from local_start)::integer
        and (availability.valid_from is null or local_start::date >= availability.valid_from)
        and (availability.valid_to is null or local_start::date <= availability.valid_to)
        and local_start::time >= availability.starts_at
        and local_end::time <= availability.ends_at
    ) into availability_exists;

    if not availability_exists then
      raise exception using
        errcode = 'P0001',
        message = 'El turno de consultorio debe estar dentro de una franja asignada y aceptada por el kinesiólogo.';
    end if;
  end if;

  return new;
end;
$function$;

-- 4. Trigger: también se dispara cuando cambia el flag.
drop trigger if exists validate_appointment_schedule_trigger on public.appointments;
create trigger validate_appointment_schedule_trigger
  before insert or update of scheduled_at, duration_minutes, owner_id, clinic_id, clinic_professional_id, appointment_origin, status, allows_simultaneous
  on public.appointments
  for each row execute function public.validate_appointment_schedule();

commit;
