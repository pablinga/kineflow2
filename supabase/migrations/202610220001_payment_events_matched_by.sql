-- Cómo asoció el webhook cada preapproval de Mercado Pago con una fila de
-- subscriptions (provider_subscription_id | external_reference |
-- parsed_reference | payer_email). Sirve para saber, con el primer pago real
-- o de prueba, si Mercado Pago conserva nuestra external_reference: antes
-- solo quedaba en los logs de Vercel (1 hora de retención en Hobby).
alter table public.payment_events
  add column if not exists matched_by text;
