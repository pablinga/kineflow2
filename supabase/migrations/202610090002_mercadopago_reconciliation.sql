-- Reconciliación de suscripciones de Mercado Pago.
--
-- subscriptions.external_reference: la referencia que create-subscription manda
-- al checkout. Antes no se guardaba, así que un webhook o una consulta a la
-- API no tenía con qué encontrar la fila PENDING_PAYMENT.
--
-- payment_events: estado de cada evento (antes solo processed true/false) para
-- distinguir los rechazados por firma, los que no se pudieron asociar a una
-- fila y los que fallaron y Mercado Pago va a reintentar.
alter table public.subscriptions
  add column if not exists external_reference text;

create unique index if not exists subscriptions_external_reference_idx
  on public.subscriptions (external_reference)
  where external_reference is not null;

alter table public.payment_events
  add column if not exists status text not null default 'received',
  add column if not exists error text,
  add column if not exists attempts integer not null default 1,
  add column if not exists processed_at timestamptz;

update public.payment_events
set status = 'processed'
where processed and status = 'received';

alter table public.payment_events
  drop constraint if exists payment_events_status_check;

alter table public.payment_events
  add constraint payment_events_status_check check (
    status in ('received', 'processed', 'ignored', 'unresolved', 'failed', 'rejected')
  );

create index if not exists payment_events_status_created_idx
  on public.payment_events (status, created_at desc);
