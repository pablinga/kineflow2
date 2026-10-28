-- Deshace 202610280001_booking_deposits.sql.
-- Antes de correrlo: no puede quedar ningún turno en 'awaiting_payment'
-- (se cancelan acá) y se pierden las señas registradas en los turnos.

update public.appointments
set status = 'cancelled', cancelled_by = 'system', cancelled_at = now()
where status = 'awaiting_payment';

drop index if exists public.appointments_awaiting_payment_idx;
drop index if exists public.appointments_deposit_mp_payment_id_key;

alter table public.appointments
  drop constraint if exists appointments_cancelled_by_check,
  drop constraint if exists appointments_awaiting_payment_check,
  drop constraint if exists appointments_deposit_amount_check,
  drop constraint if exists appointments_deposit_status_check,
  drop column if exists cancelled_at,
  drop column if exists cancelled_by,
  drop column if exists deposit_refunded_at,
  drop column if exists deposit_refund_id,
  drop column if exists deposit_paid_at,
  drop column if exists deposit_mp_payment_id,
  drop column if exists deposit_preference_id,
  drop column if exists deposit_expires_at,
  drop column if exists deposit_status,
  drop column if exists deposit_amount;

alter table public.appointments
  drop constraint if exists appointments_status_check,
  add constraint appointments_status_check check (
    status in ('pending', 'attended', 'cancelled', 'no_show', 'rescheduled')
  );

drop table if exists public.deposit_settings;
drop table if exists public.mp_connections;
