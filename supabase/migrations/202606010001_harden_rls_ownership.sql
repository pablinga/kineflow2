alter table public.profiles force row level security;
alter table public.patients force row level security;
alter table public.appointments force row level security;
alter table public.evolutions force row level security;
alter table public.clinics force row level security;
alter table public.clinic_professionals force row level security;
alter table public.clinic_professional_availability force row level security;
alter table public.subscriptions force row level security;
alter table public.payment_events force row level security;

create or replace function public.is_assigned_appointment_professional(target_appointment_id uuid)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select exists (
    select 1
    from public.appointments
    join public.clinic_professionals
      on clinic_professionals.id = appointments.clinic_professional_id
    where appointments.id = target_appointment_id
      and clinic_professionals.professional_id = auth.uid()
      and clinic_professionals.status = 'accepted'
  );
$function$;

create or replace function public.appointment_patient_matches_context(
  target_patient_id uuid,
  target_owner_id uuid,
  target_clinic_id uuid,
  target_origin text
)
returns boolean
stable
language sql
security definer
set search_path = public
as $function$
  select (
    target_origin = 'independent'
    and target_clinic_id is null
    and exists (
      select 1
      from public.patients
      where patients.id = target_patient_id
        and patients.owner_id = target_owner_id
        and patients.clinic_id is null
        and patients.status = 'active'
    )
  )
  or (
    target_origin = 'clinic'
    and target_clinic_id is not null
    and exists (
      select 1
      from public.patients
      join public.clinics on clinics.id = target_clinic_id
      where patients.id = target_patient_id
        and patients.owner_id = clinics.owner_id
        and patients.clinic_id = target_clinic_id
        and patients.status = 'active'
    )
  );
$function$;

drop policy if exists "Users can update own appointments" on public.appointments;
create policy "Users can update own appointments"
on public.appointments for update
to authenticated
using (
  (
    appointment_origin = 'independent'
    and auth.uid() = owner_id
    and clinic_id is null
  )
  or (
    appointment_origin = 'clinic'
    and (
      public.is_clinic_owner(clinic_id)
      or public.is_assigned_appointment_professional(id)
    )
  )
)
with check (
  public.appointment_patient_matches_context(
    patient_id,
    owner_id,
    clinic_id,
    appointment_origin
  )
  and (
    (
      appointment_origin = 'independent'
      and auth.uid() = owner_id
      and clinic_id is null
    )
    or (
      appointment_origin = 'clinic'
      and exists (
        select 1
        from public.clinic_professionals
        where clinic_professionals.id = clinic_professional_id
          and clinic_professionals.clinic_id = clinic_id
          and clinic_professionals.professional_id = owner_id
          and clinic_professionals.status = 'accepted'
      )
      and (
        public.is_clinic_owner(clinic_id)
        or public.is_assigned_appointment_professional(id)
      )
    )
  )
);

drop policy if exists "Users can delete own appointments" on public.appointments;
create policy "Users can delete own appointments"
on public.appointments for delete
to authenticated
using (
  (
    appointment_origin = 'independent'
    and auth.uid() = owner_id
    and clinic_id is null
  )
  or (
    appointment_origin = 'clinic'
    and public.is_clinic_owner(clinic_id)
  )
);

drop policy if exists "Users can update own evolutions" on public.evolutions;
create policy "Users can update own evolutions"
on public.evolutions for update
to authenticated
using (
  auth.uid() = owner_id
  and public.can_access_patient(patient_id)
)
with check (
  auth.uid() = owner_id
  and public.can_access_patient(patient_id)
);

drop policy if exists "Users can delete own evolutions" on public.evolutions;
create policy "Users can delete own evolutions"
on public.evolutions for delete
to authenticated
using (
  auth.uid() = owner_id
  and public.can_access_patient(patient_id)
);
