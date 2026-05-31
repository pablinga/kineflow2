alter table public.subscriptions
  add column if not exists canceled_at timestamptz,
  add column if not exists cancellation_reference text;

alter table public.profiles
  add column if not exists plan_status text,
  add column if not exists subscription_provider text,
  add column if not exists mercado_pago_preapproval_id text,
  add column if not exists subscription_started_at timestamptz,
  add column if not exists subscription_current_period_end timestamptz,
  add column if not exists subscription_canceled_at timestamptz,
  add column if not exists cancel_request_code text;
