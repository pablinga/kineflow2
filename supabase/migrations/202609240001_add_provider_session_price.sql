-- Precio por sesión de cada obra social y ART. Al elegir el prestador en un
-- turno nuevo se precarga como monto de la sesión. null = sin precio cargado.

alter table public.insurance_providers
  add column if not exists session_price numeric(12,2),
  add constraint insurance_providers_session_price_check check (session_price is null or session_price >= 0);

alter table public.art_providers
  add column if not exists session_price numeric(12,2),
  add constraint art_providers_session_price_check check (session_price is null or session_price >= 0);
