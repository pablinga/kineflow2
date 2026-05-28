# KineFlow

Aplicacion web inicial para gestion clinica de kinesiologos, creada con Next.js 15, React, TypeScript, TailwindCSS y Supabase.

## Pantallas incluidas

- Home publica con hero, beneficios, planes, como funciona, CTA y footer.
- Login.
- Registro.
- Dashboard responsive con bienvenida, metricas, accesos rapidos, turnos y pacientes.

## Configuracion local

1. Instala dependencias:

```bash
npm install
```

2. Crea `.env.local` a partir de `.env.example` y completa las credenciales publicas de Supabase:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://example-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=example-public-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

No uses `NEXT_PUBLIC_` para secretos privados. Las recomendaciones para cargar variables en Vercel estan en `SECURITY.md`.

## Planes y Mercado Pago

La app incluye tres planes comerciales:

- Free: hasta 5 pacientes activos.
- Independiente: pacientes ilimitados para un kinesiologo individual.
- Clinica / Consultorio: estructura preparada para varios profesionales.

Para habilitar suscripciones con Mercado Pago, agrega estas variables:

```bash
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY=TEST-tu-public-key
MERCADOPAGO_ACCESS_TOKEN=TEST-tu-token
MERCADOPAGO_TEST_PAYER_EMAIL=comprador-test@example.com
MERCADOPAGO_WEBHOOK_SECRET=tu-secreto-si-lo-configuras
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

El boton interno de upgrade llama a `/api/billing/create-subscription`. Si falta `MERCADOPAGO_ACCESS_TOKEN`, la app muestra un mensaje controlado y no rompe el flujo. Cuando Mercado Pago envie el webhook a `/api/webhooks/mercadopago`, el backend consulta la suscripcion en Mercado Pago y actualiza el plan usando `SUPABASE_SERVICE_ROLE_KEY`; el cliente no activa planes pagos por su cuenta.

Pendiente para produccion real: configurar credenciales definitivas, URL publica de webhook, validacion completa de firma de Mercado Pago segun el panel usado, y probar pagos sandbox/end-to-end antes de cobrar.

Guia completa: [docs/mercadopago-suscripciones.md](docs/mercadopago-suscripciones.md).

URL de retorno del plan de suscripcion en Mercado Pago:

```bash
# QA / Preview
https://tu-preview-o-dominio-qa/suscripcion/resultado

# Produccion
https://tudominio.com/suscripcion/resultado
```

3. Inicia el entorno local:

```bash
npm run dev
```

La app queda disponible en `http://localhost:3000`.
