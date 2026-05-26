alter table public.appointments
drop constraint if exists appointments_modality_check;

alter table public.appointments
add constraint appointments_modality_check
check (modality in ('presencial', 'domicilio', 'virtual'));
