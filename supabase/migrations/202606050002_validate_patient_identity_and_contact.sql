create or replace function public.validate_patient_identity_and_contact()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  existing_patient_name text;
begin
  new.document_number := btrim(new.document_number);
  new.full_name := btrim(new.full_name);
  new.phone := nullif(btrim(coalesce(new.phone, '')), '');
  new.email := nullif(btrim(coalesce(new.email, '')), '');
  new.initial_condition := btrim(new.initial_condition);

  if new.phone is null and new.email is null then
    raise exception 'Ingresá al menos un medio de contacto (teléfono o email)';
  end if;

  select patients.full_name
    into existing_patient_name
  from public.patients
  where patients.owner_id = new.owner_id
    and patients.document_number = new.document_number
    and patients.id is distinct from new.id
  limit 1;

  if existing_patient_name is not null then
    raise exception 'Ya tenés un paciente registrado con ese DNI: %', existing_patient_name;
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_patient_identity_and_contact on public.patients;
create trigger validate_patient_identity_and_contact
before insert or update of document_number, full_name, phone, email, initial_condition
on public.patients
for each row execute function public.validate_patient_identity_and_contact();
