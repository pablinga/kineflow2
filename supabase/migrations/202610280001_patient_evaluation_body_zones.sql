-- Mapa corporal en la evaluación kinésica: las zonas marcadas en el dibujo
-- se guardan como claves (`src/lib/body-zones.ts`, ej. 'rodilla_der').
-- pain_location sigue siendo obligatoria y guarda el texto legible (zonas +
-- detalle), así las evaluaciones viejas y las pantallas que muestran solo el
-- texto no cambian.
--
-- Si se agrega una zona al catálogo, reemplazar este check en otra migración.

begin;

alter table public.patient_evaluations
  add column if not exists body_zones text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'patient_evaluations_body_zones_check'
      and conrelid = 'public.patient_evaluations'::regclass
  ) then
    alter table public.patient_evaluations
      add constraint patient_evaluations_body_zones_check
      check (body_zones <@ array[
      'cervical',
      'dorsal',
      'lumbar',
      'sacro',
      'torax',
      'abdomen',
      'trapecio_der',
      'trapecio_izq',
      'atm',
      'hombro_der',
      'hombro_izq',
      'brazo_der',
      'brazo_izq',
      'codo_der',
      'codo_izq',
      'antebrazo_der',
      'antebrazo_izq',
      'mano_der',
      'mano_izq',
      'gluteo_der',
      'gluteo_izq',
      'ingle_der',
      'ingle_izq',
      'muslo_der',
      'muslo_izq',
      'isquios_der',
      'isquios_izq',
      'rodilla_der',
      'rodilla_izq',
      'pierna_der',
      'pierna_izq',
      'gemelo_der',
      'gemelo_izq',
      'tobillo_der',
      'tobillo_izq',
      'pie_der',
      'pie_izq'
      ]::text[]);
  end if;
end $$;

commit;
