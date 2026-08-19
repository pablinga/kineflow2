create or replace function public.raise_if_account_read_only(target_account_id uuid)
returns void
stable
language plpgsql
security definer
set search_path = public
as $function$
begin
  if public.get_account_access_level(target_account_id) = 'READ_ONLY' then
    raise exception 'Tu período de prueba gratuita venció. Activá un plan para seguir gestionando pacientes.';
  end if;
end;
$function$;

create or replace function public.enforce_patient_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.raise_if_account_read_only(new.owner_id);
  return new;
end;
$function$;

drop trigger if exists enforce_patient_plan_limit on public.patients;
create trigger enforce_patient_plan_limit
before insert or update on public.patients
for each row execute function public.enforce_patient_plan_limit();

create or replace function public.enforce_appointment_patient_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.raise_if_account_read_only(new.owner_id);
  return new;
end;
$function$;

drop trigger if exists enforce_appointment_patient_limit on public.appointments;
create trigger enforce_appointment_patient_limit
before insert or update on public.appointments
for each row execute function public.enforce_appointment_patient_limit();

create or replace function public.enforce_evolution_patient_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.raise_if_account_read_only(new.owner_id);
  return new;
end;
$function$;

drop trigger if exists enforce_evolution_patient_limit on public.evolutions;
create trigger enforce_evolution_patient_limit
before insert or update on public.evolutions
for each row execute function public.enforce_evolution_patient_limit();

create or replace function public.enforce_treatment_access_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.raise_if_account_read_only(new.owner_id);
  return new;
end;
$function$;

drop trigger if exists enforce_treatment_access_level on public.treatments;
create trigger enforce_treatment_access_level
before insert or update on public.treatments
for each row execute function public.enforce_treatment_access_level();

create or replace function public.enforce_independent_availability_access_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  perform public.raise_if_account_read_only(new.owner_id);
  return new;
end;
$function$;

drop trigger if exists enforce_independent_availability_access_level on public.independent_availability;
create trigger enforce_independent_availability_access_level
before insert or update on public.independent_availability
for each row execute function public.enforce_independent_availability_access_level();

create or replace function public.enforce_clinic_professional_availability_access_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_account_id uuid;
begin
  select clinics.owner_id
    into target_account_id
  from public.clinic_professionals
  join public.clinics on clinics.id = clinic_professionals.clinic_id
  where clinic_professionals.id = new.clinic_professional_id;

  perform public.raise_if_account_read_only(target_account_id);
  return new;
end;
$function$;

drop trigger if exists enforce_clinic_professional_availability_access_level on public.clinic_professional_availability;
create trigger enforce_clinic_professional_availability_access_level
before insert or update on public.clinic_professional_availability
for each row execute function public.enforce_clinic_professional_availability_access_level();

create or replace function public.enforce_workspace_owned_access_level()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_account_id uuid;
begin
  select workspaces.owner_id
    into target_account_id
  from public.workspaces
  where workspaces.id = new.workspace_id;

  perform public.raise_if_account_read_only(target_account_id);
  return new;
end;
$function$;

drop trigger if exists enforce_insurance_provider_access_level on public.insurance_providers;
create trigger enforce_insurance_provider_access_level
before insert or update on public.insurance_providers
for each row execute function public.enforce_workspace_owned_access_level();

drop trigger if exists enforce_workspace_blocked_date_access_level on public.workspace_blocked_dates;
create trigger enforce_workspace_blocked_date_access_level
before insert or update on public.workspace_blocked_dates
for each row execute function public.enforce_workspace_owned_access_level();
