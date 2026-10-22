-- ¿Mercado Pago conserva nuestra external_reference? Correr después de un
-- pago real o de prueba (requiere 202610220001: payment_events.matched_by).
--   external_reference / parsed_reference → sí la conserva (lo ideal).
--   payer_email → devolvió la referencia fija del plan (KINEPART, ...) y se
--                 asoció por el email del pagador.
--   status 'unresolved' → no se pudo asociar: revisar con
--                 scripts/reconcile-mercadopago-subscriptions.mjs.
select created_at, event_type, status, matched_by, error
from public.payment_events
where provider = 'mercadopago'
order by created_at desc
limit 20;

-- Suscripciones: la fila del pago tiene que quedar ACTIVE con el id de
-- Mercado Pago asociado.
select s.created_at, s.status, p.code as plan,
       s.external_reference is not null as has_reference,
       s.provider_subscription_id is not null as has_mercadopago_id
from public.subscriptions s
left join public.plans p on p.id = s.plan_id
order by s.created_at desc
limit 10;
