-- Sexo del paciente (opcional): se muestra en la ficha y elige la silueta
-- (mujer / hombre) del mapa corporal de la evaluación.

alter table public.patients
  add column if not exists sex text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patients_sex_check') then
    alter table public.patients
      add constraint patients_sex_check check (sex is null or sex in ('female', 'male'));
  end if;
end $$;
