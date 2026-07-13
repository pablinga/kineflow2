# Ambientes

KineFlow usa Supabase a traves de variables de entorno. No hay URLs ni claves hardcodeadas en la app: el cliente y las rutas server-side leen la configuracion desde el ambiente donde corre Next.js.

## Supabase QA

Proyecto: `kineflow-qa`.

Uso esperado:

- Validar cambios en Vercel Preview.
- Probar migraciones sin datos reales.
- Ejecutar seeds ficticios si hace falta QA manual.

Inicializacion:

1. Ejecutar `supabase/migrations/202605310001_init_kineflow_qa.sql` en el proyecto `kineflow-qa`.
2. Crear un usuario de prueba desde Supabase Auth.
3. Opcionalmente ejecutar `supabase/seed.qa.sql` reemplazando el UUID placeholder por el UUID del usuario de prueba.

No copiar datos reales de producción a QA. Esto incluye pacientes, turnos, cobros, usuarios, perfiles, suscripciones y eventos de pago.

## Supabase Produccion

Produccion debe seguir apuntando al proyecto productivo actual de Supabase.

Reglas:

- No ejecutar seeds de QA en produccion.
- No usar claves de QA en Vercel Production.
- No usar service role keys en el navegador.
- Ejecutar migraciones primero en QA y luego promoverlas a produccion cuando esten validadas.

## Variables para Vercel Preview

Configurar estas variables con valores del proyecto `kineflow-qa`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Tambien deben existir las variables de la app que apliquen al flujo probado, por ejemplo:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID
NEXT_PUBLIC_ENABLE_CLINIC_FEATURES
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_TEST_PAYER_EMAIL
MERCADOPAGO_WEBHOOK_SECRET
```

Para QA, configurar `NEXT_PUBLIC_APP_URL=https://qa.kineflow.ar` y usar credenciales de prueba o sandbox cuando correspondan.

## Variables para Vercel Production

Configurar estas variables con valores del proyecto productivo:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Y las variables productivas de la app:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY
NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID
NEXT_PUBLIC_ENABLE_CLINIC_FEATURES
MERCADOPAGO_ACCESS_TOKEN
MERCADOPAGO_TEST_PAYER_EMAIL
MERCADOPAGO_WEBHOOK_SECRET
```

## Como evitar mezclar ambientes

- En Vercel, mantener valores separados entre Preview y Production.
- Revisar que `NEXT_PUBLIC_SUPABASE_URL` de Preview apunte a `kineflow-qa` antes de probar.
- Revisar que `NEXT_PUBLIC_SUPABASE_URL` de Production apunte al proyecto productivo antes de publicar.
- Nunca copiar `SUPABASE_SERVICE_ROLE_KEY` entre ambientes.
- Usar usuarios de prueba y emails ficticios en QA.
- No cargar backups ni exports productivos en `kineflow-qa`.
- Antes de correr SQL destructivo, confirmar visualmente el nombre del proyecto en el dashboard de Supabase.

## URLs de recuperación de contraseña en Supabase Auth

El flujo de recuperación usa `supabase.auth.resetPasswordForEmail` y redirige al usuario a `/nueva-password` sobre el mismo origen donde está corriendo KineFlow. No hay URLs de localhost hardcodeadas: local, QA y producción usan el dominio actual del navegador.

En Supabase Auth, configurar:

- Site URL: el dominio principal del ambiente, por ejemplo `https://qa.kineflow.ar` en QA y `https://kineflow.ar` en producción.
- Redirect URLs permitidas:
  - `http://localhost:3000/nueva-password` para desarrollo local.
  - `https://qa.kineflow.ar/nueva-password` para QA.
  - `https://kineflow.ar/nueva-password` para producción.

Si Vercel Preview usa dominios temporales, agregar también el patrón de preview correspondiente de ese proyecto para `/nueva-password`.
