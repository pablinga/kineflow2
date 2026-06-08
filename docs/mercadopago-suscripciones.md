# Configuración de Mercado Pago para suscripciones

Esta app usa un plan de suscripción ya creado en Mercado Pago. El backend crea la preapproval con el access token privado, redirige al `sandbox_init_point` o `init_point` devuelto por Mercado Pago y el webhook actualiza Supabase después de consultar el recurso real.

## 1. Credenciales de prueba

En Mercado Pago, usa la cuenta vendedora de prueba para copiar:

- Access token de prueba.
- ID del plan de suscripción activo.

Despues completa `.env.local`:

```bash
NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID=a7be629d2d77468a94dac3e415d487e4
MERCADOPAGO_ACCESS_TOKEN=TEST-tu-access-token-del-vendedor
```

El access token tiene que ser del vendedor de prueba. No uses el mismo usuario para vender y comprar durante la prueba.

## 2. Variables de la app

Tambien verifica estas variables:

```bash
NEXT_PUBLIC_APP_URL=https://qa.kineflow.ar
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

Para QA, `NEXT_PUBLIC_APP_URL` debe ser el dominio real `https://qa.kineflow.ar`. En produccion debe ser `https://kineflow.ar`.

## 3. Base de datos

Aplica las migraciones de Supabase, en especial:

```bash
supabase/migrations/202605270004_add_mercadopago_subscriptions.sql
```

Esa migracion crea `plans`, `subscriptions` y `payment_events`, ademas de insertar los planes comerciales que usa la pantalla de planes.

## 4. Webhook

En la aplicacion de Mercado Pago, configura un webhook hacia:

```text
https://qa.kineflow.ar/api/mercadopago/webhook
```

Para produccion:

```text
https://kineflow.ar/api/mercadopago/webhook
```

Activa los eventos `subscription_preapproval`, `subscription_authorized_payment` y `payment`. Si Mercado Pago te muestra una clave secreta de webhook, copiala en:

```bash
MERCADOPAGO_WEBHOOK_SECRET=tu-webhook-secret
```

Si esa variable esta configurada, la app valida la firma `x-signature` antes de procesar el evento.

## 5. Flujo de prueba

1. Inicia la app.
2. Entra con un usuario de KineFlow.
3. Ve a Dashboard > Planes.
4. Elegi un plan pago.
5. La app crea la preapproval y redirige al checkout devuelto por Mercado Pago.
6. Paga usando el comprador de prueba y una tarjeta de prueba.
7. Mercado Pago vuelve a `/suscripcion-exitosa`, `/suscripcion-pendiente` o `/suscripcion-error`.
8. La app consulta el estado real del usuario en Supabase.
9. Si Mercado Pago confirma la suscripción, el webhook actualiza el plan en Supabase.
10. El webhook mantiene sincronizados los cambios posteriores.

## 6. Checklist antes de produccion

- Cambiar `MERCADOPAGO_ACCESS_TOKEN` por el access token productivo del vendedor real.
- Cambiar `NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID` por el plan productivo.
- Usar `NEXT_PUBLIC_APP_URL=https://kineflow.ar`.
- Configurar el webhook productivo con `/api/mercadopago/webhook`.
- Cargar `MERCADOPAGO_WEBHOOK_SECRET` si Mercado Pago lo entrega en el panel.
- Hacer una compra real de bajo monto y confirmar que `profiles.estado_plan` queda `ACTIVO`.
- Confirmar que cancelar desde la app cambia la suscripción de Mercado Pago a `cancelled` o `canceled`.

## 7. Validacion manual de baja y webhook

1. Con un usuario con KineFlow - Particular activo y `mercado_pago_preapproval_id`, entrar a Plan / Suscripcion y cancelar desde KineFlow.
2. Confirmar que Mercado Pago responde correctamente y que el perfil queda en `plan = FREE`, `plan_status = cancelled`, `mercado_pago_status = cancelled` y `subscription_canceled_at` / `cancelled_at` con fecha.
3. Enviar o simular un webhook de preapproval con estado `cancelled` o `canceled`; verificar que el usuario asociado por `mercado_pago_preapproval_id` queda en Plan Free.
4. Enviar o simular un webhook de preapproval con estado `authorized`; verificar que el usuario queda con KineFlow - Particular activo.
5. Ingresar con un usuario Free y confirmar que no ve el botón Cancelar suscripción.
