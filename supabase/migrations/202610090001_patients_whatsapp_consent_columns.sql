-- Consentimiento de WhatsApp en el paciente. Las columnas ya existían en QA y
-- prod (creadas fuera del repo); esta migración las deja versionadas y es
-- idempotente: en esos ambientes no cambia nada.
--   phone_e164          número normalizado al que se envían confirmación y recordatorios
--   whatsapp_consent    solo lo pone en true la reserva online pública
--   whatsapp_consent_at cuándo lo aceptó
alter table public.patients
  add column if not exists phone_e164 text,
  add column if not exists whatsapp_consent boolean not null default false,
  add column if not exists whatsapp_consent_at timestamptz;
