create or replace function public.can_access_workspace_appointment(target_appointment_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.appointments
    where appointments.id = target_appointment_id
      and (
        public.is_workspace_admin(appointments.workspace_id)
        or (
          appointments.owner_id = auth.uid()
          and public.is_workspace_member(appointments.workspace_id)
        )
        or public.can_access_workspace_patient(appointments.patient_id)
      )
  );
$function$;

create or replace function public.can_manage_workspace_appointment(target_appointment_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.appointments
    join public.workspaces on workspaces.id = appointments.workspace_id
    where appointments.id = target_appointment_id
      and (
        public.is_workspace_admin(appointments.workspace_id)
        or (
          workspaces.type = 'PERSONAL'
          and appointments.owner_id = auth.uid()
        )
      )
  );
$function$;

create or replace function public.can_access_workspace_treatment(target_treatment_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.treatments
    where treatments.id = target_treatment_id
      and (
        public.is_workspace_admin(treatments.workspace_id)
        or public.can_access_workspace_patient(treatments.patient_id)
      )
  );
$function$;

create or replace function public.can_manage_workspace_treatment(target_treatment_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.treatments
    join public.workspaces on workspaces.id = treatments.workspace_id
    where treatments.id = target_treatment_id
      and (
        public.is_workspace_admin(treatments.workspace_id)
        or (
          workspaces.type = 'PERSONAL'
          and treatments.owner_id = auth.uid()
        )
      )
  );
$function$;

create or replace function public.can_insert_workspace_patient(
  target_workspace_id uuid,
  target_owner_id uuid,
  target_clinic_id uuid
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
    where workspaces.id = target_workspace_id
      and public.is_workspace_admin(workspaces.id)
      and (
        (
          workspaces.type = 'PERSONAL'
          and workspaces.owner_id = auth.uid()
          and target_owner_id = auth.uid()
          and target_clinic_id is null
        )
        or (
          workspaces.type = 'CLINICA'
          and workspaces.source_clinic_id = target_clinic_id
        )
      )
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
              and clinic_professionals.status = 'accepted'
          )
        )
      )
  );
$function$;

create or replace function public.can_insert_workspace_evolution(
  target_workspace_id uuid,
  target_owner_id uuid,
  target_patient_id uuid,
  target_appointment_id uuid
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.patients
    where patients.id = target_patient_id
      and patients.workspace_id = target_workspace_id
      and patients.status = 'active'
      and target_owner_id = auth.uid()
      and (
        public.is_workspace_admin(target_workspace_id)
        or public.is_patient_assigned_to_user(target_patient_id)
        or exists (
          select 1
          from public.appointments
          where appointments.id = target_appointment_id
            and appointments.patient_id = target_patient_id
            and appointments.workspace_id = target_workspace_id
            and appointments.owner_id = auth.uid()
        )
      )
  );
$function$;

create or replace function public.can_insert_workspace_treatment(
  target_workspace_id uuid,
  target_owner_id uuid,
  target_patient_id uuid
)
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
      and patients.workspace_id = target_workspace_id
      and target_owner_id = auth.uid()
      and (
        public.is_workspace_admin(target_workspace_id)
        or (
          workspaces.type = 'PERSONAL'
          and workspaces.owner_id = auth.uid()
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

drop trigger if exists enforce_patient_plan_limit on public.patients;
create trigger enforce_patient_plan_limit
before insert on public.patients
for each row execute function public.enforce_patient_plan_limit();

create or replace function public.get_patient_limit_block_message(target_account_id uuid)
returns text
stable
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_workspace_id uuid;
begin
  target_workspace_id := public.get_personal_workspace_id(target_account_id);

  if target_workspace_id is not null then
    return public.get_workspace_patient_limit_block_message(target_workspace_id);
  end if;

  return null;
end;
$function$;

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
    and patients.status = 'active';

  if active_patients > patient_limit then
    return format(
      'Tu plan Free permite hasta %s pacientes activos por espacio de trabajo. Tenes %s pacientes activos.',
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
  if new.workspace_id is null and tg_table_name = 'appointments' then
    if new.clinic_id is not null then
      new.workspace_id := public.get_clinic_workspace_id(new.clinic_id);
    end if;

    if new.workspace_id is null then
      select patients.workspace_id
        into new.workspace_id
      from public.patients
      where patients.id = new.patient_id;
    end if;

    if new.workspace_id is null then
      new.workspace_id := public.get_personal_workspace_id(new.owner_id);
    end if;
  end if;

  if new.workspace_id is null and tg_table_name = 'evolutions' then
    if new.appointment_id is not null then
      select appointments.workspace_id
        into new.workspace_id
      from public.appointments
      where appointments.id = new.appointment_id;
    end if;

    if new.workspace_id is null then
      select patients.workspace_id
        into new.workspace_id
      from public.patients
      where patients.id = new.patient_id;
    end if;

    if new.workspace_id is null then
      new.workspace_id := public.get_personal_workspace_id(new.owner_id);
    end if;
  end if;

  if new.workspace_id is null then
    return new;
  end if;

  block_message := public.get_workspace_patient_limit_block_message(new.workspace_id);

  if block_message is not null then
    raise exception '%', block_message;
  end if;

  return new;
end;
$function$;

drop policy if exists "Users can read own patients" on public.patients;
create policy "Users can read own patients"
on public.patients for select
to authenticated
using (public.can_access_workspace_patient(id));

drop policy if exists "Users can create own patients" on public.patients;
create policy "Users can create own patients"
on public.patients for insert
to authenticated
with check (
  public.can_insert_workspace_patient(workspace_id, owner_id, clinic_id)
);

drop policy if exists "Users can update own patients" on public.patients;
create policy "Users can update own patients"
on public.patients for update
to authenticated
using (public.can_manage_workspace_patient(id))
with check (
  public.can_insert_workspace_patient(workspace_id, owner_id, clinic_id)
);

drop policy if exists "Users can delete own patients" on public.patients;
create policy "Users can delete own patients"
on public.patients for delete
to authenticated
using (public.can_manage_workspace_patient(id));

drop policy if exists "Users can read own appointments" on public.appointments;
create policy "Users can read own appointments"
on public.appointments for select
to authenticated
using (public.can_access_workspace_appointment(id));

drop policy if exists "Users can create own appointments" on public.appointments;
create policy "Users can create own appointments"
on public.appointments for insert
to authenticated
with check (
  public.can_insert_workspace_appointment(
    workspace_id,
    owner_id,
    patient_id,
    clinic_id,
    clinic_professional_id,
    appointment_origin
  )
);

drop policy if exists "Users can update own appointments" on public.appointments;
create policy "Users can update own appointments"
on public.appointments for update
to authenticated
using (public.can_manage_workspace_appointment(id))
with check (
  public.can_insert_workspace_appointment(
    workspace_id,
    owner_id,
    patient_id,
    clinic_id,
    clinic_professional_id,
    appointment_origin
  )
);

drop policy if exists "Users can delete own appointments" on public.appointments;
create policy "Users can delete own appointments"
on public.appointments for delete
to authenticated
using (public.can_manage_workspace_appointment(id));

drop policy if exists "Users can read own evolutions" on public.evolutions;
create policy "Users can read own evolutions"
on public.evolutions for select
to authenticated
using (public.can_access_workspace_patient(patient_id));

drop policy if exists "Users can create own evolutions" on public.evolutions;
create policy "Users can create own evolutions"
on public.evolutions for insert
to authenticated
with check (
  public.can_insert_workspace_evolution(
    workspace_id,
    owner_id,
    patient_id,
    appointment_id
  )
);

drop policy if exists "Users can update own evolutions" on public.evolutions;
create policy "Users can update own evolutions"
on public.evolutions for update
to authenticated
using (
  owner_id = auth.uid()
  and public.can_access_workspace_patient(patient_id)
)
with check (
  owner_id = auth.uid()
  and public.can_access_workspace_patient(patient_id)
);

drop policy if exists "Users can delete own evolutions" on public.evolutions;
create policy "Users can delete own evolutions"
on public.evolutions for delete
to authenticated
using (
  owner_id = auth.uid()
  and public.can_access_workspace_patient(patient_id)
);

drop policy if exists "Owner full access" on public.treatments;
drop policy if exists "Workspace treatment read access" on public.treatments;
create policy "Workspace treatment read access"
on public.treatments for select
to authenticated
using (public.can_access_workspace_treatment(id));

drop policy if exists "Workspace treatment insert access" on public.treatments;
create policy "Workspace treatment insert access"
on public.treatments for insert
to authenticated
with check (
  public.can_insert_workspace_treatment(workspace_id, owner_id, patient_id)
);

drop policy if exists "Workspace treatment update access" on public.treatments;
create policy "Workspace treatment update access"
on public.treatments for update
to authenticated
using (public.can_manage_workspace_treatment(id))
with check (
  public.can_insert_workspace_treatment(workspace_id, owner_id, patient_id)
);

drop policy if exists "Workspace treatment delete access" on public.treatments;
create policy "Workspace treatment delete access"
on public.treatments for delete
to authenticated
using (public.can_manage_workspace_treatment(id));

drop policy if exists "Users can read own subscriptions" on public.subscriptions;
create policy "Users can read own subscriptions"
on public.subscriptions for select
to authenticated
using (
  account_id = auth.uid()
  or (
    workspace_id is not null
    and public.is_workspace_admin(workspace_id)
  )
);
