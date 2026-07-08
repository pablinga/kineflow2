update public.clinic_professionals
set status = case
  when status = 'accepted' then 'active'
  when status = 'rejected' then 'inactive'
  else status
end
where status in ('accepted', 'rejected');

alter table public.clinic_professionals
  alter column status set default 'pending';

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
  where professional_id is not null
    and status in ('pending', 'active');

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
