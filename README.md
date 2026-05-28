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
NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID=a7be629d2d77468a94dac3e415d487e4
MERCADOPAGO_ACCESS_TOKEN=TEST-tu-token
MERCADOPAGO_WEBHOOK_SECRET=tu-secreto-si-lo-configuras
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
```

El boton interno de upgrade redirige directo al checkout del plan de Mercado Pago usando `NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID`; no crea preapprovals por API. Al volver a `/suscripcion/resultado`, el backend valida el `preapproval_id` contra Mercado Pago con `MERCADOPAGO_ACCESS_TOKEN` y actualiza el plan usando `SUPABASE_SERVICE_ROLE_KEY`. El webhook `/api/webhooks/mercadopago` mantiene el estado sincronizado ante cambios posteriores.

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
