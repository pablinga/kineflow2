-- Los defaults usaban CURRENT_DATE, que la base calcula en UTC: entre las 21:00
-- y las 23:59 de Argentina daba el día siguiente. Ahora se calcula en hora de
-- Argentina. No cambia la timezone de la base ni los datos existentes.

alter table public.evolutions
  alter column session_date set default (timezone('America/Argentina/Buenos_Aires', now()))::date;
alter table public.treatments
  alter column started_at set default (timezone('America/Argentina/Buenos_Aires', now()))::date;
