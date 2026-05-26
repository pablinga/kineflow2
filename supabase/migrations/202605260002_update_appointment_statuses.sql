alter table public.appointments
drop constraint if exists appointments_status_check;

update public.appointments
set status = case
  when status = 'confirmed' then 'pending'
  when status = 'completed' then 'attended'
  else status
end
where status in ('confirmed', 'completed');

alter table public.appointments
add constraint appointments_status_check
check (status in ('pending', 'attended', 'cancelled', 'no_show', 'rescheduled'));
