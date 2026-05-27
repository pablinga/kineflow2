alter table public.appointments
  add column if not exists session_amount numeric(12, 2) not null default 0,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_method text,
  add column if not exists paid_at date,
  add column if not exists payment_notes text;

alter table public.appointments
  drop constraint if exists appointments_payment_status_check,
  add constraint appointments_payment_status_check check (
    payment_status in ('pending', 'paid', 'waived', 'not_applicable')
  );

alter table public.appointments
  drop constraint if exists appointments_payment_method_check,
  add constraint appointments_payment_method_check check (
    payment_method is null
    or payment_method in ('cash', 'transfer', 'mercado_pago', 'insurance', 'other')
  );

alter table public.appointments
  drop constraint if exists appointments_session_amount_check,
  add constraint appointments_session_amount_check check (session_amount >= 0);
