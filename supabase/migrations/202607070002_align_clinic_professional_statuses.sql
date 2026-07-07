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
