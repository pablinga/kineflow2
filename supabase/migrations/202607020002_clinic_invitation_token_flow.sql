create or replace function public.get_clinic_professional_invitation(invitation_id uuid)
returns table (
  id uuid,
  clinic_id uuid,
  clinic_name text,
  professional_email text,
  status text
)
stable
language sql
security definer
set search_path = public
as $function$
  select
    clinic_professionals.id,
    clinic_professionals.clinic_id,
    clinics.name as clinic_name,
    clinic_professionals.professional_email,
    clinic_professionals.status
  from public.clinic_professionals
  join public.clinics on clinics.id = clinic_professionals.clinic_id
  where clinic_professionals.id = invitation_id
  limit 1;
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
  if target_status not in ('accepted', 'rejected') then
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

grant execute on function public.get_clinic_professional_invitation(uuid) to anon, authenticated;
grant execute on function public.answer_clinic_professional_invitation(uuid, text, uuid, text) to anon, authenticated;
