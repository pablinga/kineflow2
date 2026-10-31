-- Aviso "una reserva entró sin seña": como mucho uno por día por espacio.
-- Para deshacer: alter table public.deposit_settings drop column last_fallback_notice_at;

alter table public.deposit_settings
  add column if not exists last_fallback_notice_at timestamptz;
