-- Checklist de activación del Inicio (cuenta nueva).
--
-- booking_link_shared_at: primera vez que el profesional tocó "Copiar link" o
-- "Compartir" en el paso 4. El paso también se completa con la primera reserva
-- online (appointments.booking_source in ('public_link', 'public_qr')), que ya
-- se deriva de los datos sin columna nueva.
--
-- activation_checklist_dismissed_at: el usuario tocó "Ocultar". Va en el perfil
-- (no en localStorage) para que se respete en todos sus dispositivos.
--
-- Las dos columnas las escribe el propio usuario con la policy existente
-- "Users can update own profile"; no hace falta policy nueva.

alter table public.profiles
  add column if not exists booking_link_shared_at timestamptz,
  add column if not exists activation_checklist_dismissed_at timestamptz;
