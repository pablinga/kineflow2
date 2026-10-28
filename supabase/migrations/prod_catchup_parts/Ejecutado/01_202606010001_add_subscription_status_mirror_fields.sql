-- ============================================================
-- Origen: 202606010001_add_subscription_status_mirror_fields.sql
-- ============================================================
alter table public.profiles
  add column if not exists mercado_pago_status text,
  add column if not exists cancelled_at timestamptz;


