alter table public.profiles
  add column if not exists mercado_pago_status text,
  add column if not exists cancelled_at timestamptz;
