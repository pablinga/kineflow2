create or replace function public.validate_appointment_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  new_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  conflicting_record record;
  reserved_record record;
  availability_exists boolean;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  new_end := new.scheduled_at + make_interval(mins => new.duration_minutes);
  local_start := timezone('America/Argentina/Buenos_Aires', new.scheduled_at);
  local_end := timezone('America/Argentina/Buenos_Aires', new_end);

  select appointments.scheduled_at,
    appointments.scheduled_at + make_interval(mins => appointments.duration_minutes) as ends_at,
    clinics.name as clinic_name
  into conflicting_record
  from public.appointments
  left join public.clinics on clinics.id = appointments.clinic_id
  where appointments.owner_id = new.owner_id
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
