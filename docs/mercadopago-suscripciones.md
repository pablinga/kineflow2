# Configuracion de Mercado Pago para suscripciones

Esta app usa suscripciones de Mercado Pago sin plan asociado. El backend crea una suscripcion `preapproval` con estado `pending`, redirige al usuario a Mercado Pago y despues confirma el estado real con el webhook.

## 1. Credenciales de prueba

En Mercado Pago, usa la cuenta vendedora de prueba para copiar:

- Public key de prueba.
- Access token de prueba.

Despues completa `.env.local`:

```bash
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=TEST-tu-public-key
MERCADOPAGO_ACCESS_TOKEN=TEST-tu-access-token-del-vendedor
MERCADOPAGO_TEST_PAYER_EMAIL=email-del-comprador-de-prueba
```

El access token tiene que ser del vendedor de prueba. El email tiene que ser del comprador de prueba. No uses el mismo usuario para vender y comprar.

## 2. Variables de la app

Tambien verifica estas variables:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

Para probar webhooks en local, `NEXT_PUBLIC_SITE_URL` debe ser una URL publica temporal, por ejemplo la URL HTTPS de ngrok. En produccion debe ser el dominio real.

## 3. Base de datos

Aplica las migraciones de Supabase, en especial:

```bash
supabase/migrations/202605270004_add_mercadopago_subscriptions.sql
```

Esa migracion crea `plans`, `subscriptions` y `payment_events`, ademas de insertar los planes comerciales que usa la pantalla de planes.

## 4. Webhook

En la aplicacion de Mercado Pago, configura un webhook hacia:

```text
https://tu-dominio.com/api/webhooks/mercadopago
```

Para entorno local con tunel:

```text
https://tu-url-publica.ngrok-free.app/api/webhooks/mercadopago
```

Activa los eventos de suscripciones/preapprovals. Si Mercado Pago te muestra una clave secreta de webhook, copiala en:

```bash
MERCADOPAGO_WEBHOOK_SECRET=tu-webhook-secret
```

Si esa variable esta configurada, la app valida la firma `x-signature` antes de procesar el evento.

## 5. Flujo de prueba

1. Inicia la app.
2. Entra con un usuario de KineFlow.
3. Ve a Dashboard > Planes.
4. Elegi un plan pago.
5. La app llama a `/api/billing/create-subscription`.
6. El backend crea una suscripcion en Mercado Pago con `/preapproval`.
7. Mercado Pago devuelve un link de checkout y la app redirige al comprador.
8. Paga usando el comprador de prueba y una tarjeta de prueba.
9. Mercado Pago llama al webhook.
10. La app consulta `/preapproval/{id}` y actualiza el plan en Supabase.

## 6. Checklist antes de produccion

- Cambiar `MERCADOPAGO_ACCESS_TOKEN` por el access token productivo del vendedor real.
- Cambiar `NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY` por la public key productiva.
- Usar un dominio HTTPS real en `NEXT_PUBLIC_SITE_URL`.
- Configurar el webhook productivo con `/api/webhooks/mercadopago`.
- Cargar `MERCADOPAGO_WEBHOOK_SECRET` si Mercado Pago lo entrega en el panel.
- Hacer una compra real de bajo monto y confirmar que `profiles.estado_plan` queda `ACTIVO`.
- Confirmar que cancelar desde la app cambia la suscripcion de Mercado Pago a `canceled`.
