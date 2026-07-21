update public.clinic_professionals
set status = case
  when status = 'accepted' then 'active'
  when status = 'rejected' then 'inactive'
  else status
end
where status in ('accepted', 'rejected');

alter table public.clinic_professionals
  drop constraint if exists clinic_professionals_status_check;

alter table public.clinic_professionals
  add constraint clinic_professionals_status_check check (
    status in ('pending', 'active', 'inactive')
  );

drop index if exists public.clinic_professionals_unique_invitation_idx;
create unique index if not exists clinic_professionals_unique_invitation_idx
  on public.clinic_professionals(clinic_id, professional_email)
  where status in ('pending', 'active');

drop index if exists public.clinic_professionals_unique_active_professional_idx;
create unique index if not exists clinic_professionals_unique_active_professional_idx
  on public.clinic_professionals(clinic_id, professional_id)
  where professional_id is not null and status in ('pending', 'active');

create or replace function public.is_accepted_clinic_professional(target_clinic_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.clinic_id = target_clinic_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'active'
  );
$function$;

create or replace function public.answer_clinic_professional_invitation(
  invitation_id uuid,
  target_status text,
  target_professional_id uuid,
  target_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if target_status not in ('active', 'inactive') then
    raise exception 'Estado de invitacion invalido.';
  end if;

  update public.clinic_professionals
  set
    professional_id = target_professional_id,
    professional_email = lower(trim(target_email)),
    responded_at = now(),
    status = target_status
  where clinic_professionals.id = invitation_id
    and clinic_professionals.status = 'pending'
    and clinic_professionals.professional_email = lower(trim(target_email));

  if not found then
    raise exception 'No encontramos una invitacion pendiente para este email.';
  end if;
end;
$function$;

create or replace function public.sync_clinic_professional_workspace_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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
    and email = lower(trim(new.professional_email));

  return new;
end;
$function$;

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
      and clinic_professionals.status = 'active'
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
      and clinic_professionals.status = 'active'
      and clinic_professionals.can_view_assigned_patients
    where patient_assignments.patient_id = target_patient_id
      and patient_assignments.professional_id = auth.uid()
      and patient_assignments.ended_at is null
      and patient_assignments.workspace_id = patients.workspace_id
  );
$function$;

create or replace function public.can_insert_workspace_appointment(
  target_workspace_id uuid,
  target_owner_id uuid,
  target_patient_id uuid,
  target_clinic_id uuid,
  target_clinic_professional_id uuid,
  target_origin text
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
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
          and public.is_workspace_admin(workspaces.id)
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

drop policy if exists "Professionals can answer invitations" on public.clinic_professionals;
create policy "Professionals can answer invitations"
on public.clinic_professionals for update
to authenticated
using (
  status = 'pending'
  and (
    professional_id = auth.uid()
    or (
      professional_id is null
      and professional_email = public.current_user_email()
    )
  )
)
with check (
  professional_id = auth.uid()
  and status in ('active', 'inactive')
);

drop policy if exists "Professionals can read availability exceptions"
on public.clinic_professional_availability_exceptions;
create policy "Professionals can read availability exceptions"
on public.clinic_professional_availability_exceptions for select
to authenticated
using (
  exists (
    select 1
    from public.clinic_professionals
    where clinic_professionals.id = clinic_professional_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'active'
  )
);

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

