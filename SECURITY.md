# Seguridad y despliegue en Vercel

## Variables de entorno

Usar siempre Environment Variables de Vercel. No commitear archivos `.env`, `.env.local`, `.env.production`, `.env.preview` ni variantes locales.

Variables publicas actuales:

| Variable | Development | Preview | Production | Notas |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Proyecto Supabase de desarrollo | Proyecto Supabase de preview/staging | Proyecto Supabase productivo | Es publica porque el cliente de Supabase la necesita en el navegador. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key de desarrollo | Anon key de preview/staging | Anon key productiva | Es publica, pero debe estar protegida con RLS en Supabase. |
| `NEXT_PUBLIC_APP_URL` | URL del ambiente | `https://qa.kineflow.ar` | `https://kineflow.ar` | Es publica y se usa para callbacks de pago. |

Variables privadas actuales:

- `MP_ACCESS_TOKEN`: token server-side para crear checkout/suscripciones.
- `MP_WEBHOOK_SECRET`: secreto/verificador si se configura firma de webhook.
- `SUPABASE_SERVICE_ROLE_KEY`: solo backend, necesario para que el webhook actualice planes.

Regla importante: tokens, service role keys, secretos de webhooks, passwords, cookies, claves privadas y credenciales de terceros no deben usar el prefijo `NEXT_PUBLIC_`.

## Separacion Preview y Production

Preview no debe apuntar a la base productiva. Configurar un proyecto Supabase separado para Preview o una base staging con datos anonimizados. Las migraciones deben probarse primero en Development/Preview antes de aplicarse a Production.

En Vercel, cargar valores independientes para:

- Development: entorno local o proyecto Supabase de desarrollo.
- Preview: proyecto Supabase staging, sin pacientes reales.
- Production: proyecto Supabase productivo.

## Proteccion de deployments preview

Activar Vercel Deployment Protection para previews cuando el proyecto maneje datos clinicos o informacion personal. Restringir el acceso por equipo, password protection o SSO segun el plan disponible.

No compartir URLs de preview con usuarios externos si apuntan a datos reales o integraciones sensibles.

## Logs

No registrar en logs datos sensibles de pacientes, tokens, cookies, emails, telefonos, DNI, historias clinicas, notas de evolucion ni respuestas completas de proveedores externos.

Si hace falta diagnosticar errores, registrar solo identificadores tecnicos no sensibles, codigos de error y mensajes sanitizados. Evitar `console.log` de objetos completos provenientes de formularios, Supabase, sesiones o webhooks.

## Dominio y HTTPS

Usar dominios configurados desde Vercel con HTTPS automatico. Mantener redirecciones a HTTPS activas y evitar callbacks de autenticacion sobre HTTP fuera del entorno local.

Configurar en Supabase Auth las URLs permitidas de Production y Preview que correspondan. No usar comodines amplios para dominios que no controla el equipo.

## Webhooks de Mercado Pago

Cuando se integre Mercado Pago:

- Guardar `MP_ACCESS_TOKEN` y el secreto/verificador del webhook como variables privadas de Vercel, sin `NEXT_PUBLIC_`.
- Validar la firma o mecanismo oficial de autenticidad del webhook antes de procesar pagos.
- Hacer el endpoint idempotente para no activar planes dos veces ante reintentos.
- No guardar datos completos de tarjetas ni informacion financiera sensible.
- Registrar solo eventos sanitizados, IDs de pago/suscripcion y estados necesarios.
- Separar credenciales de prueba para Development/Preview y credenciales reales para Production.
- Validar que el usuario, plan y monto esperado coincidan antes de activar o renovar un plan.

## Rutas API y permisos

Si se agregan rutas API en Next.js, cada endpoint que lea o modifique datos privados debe validar sesion, pertenencia del recurso y permisos del usuario antes de ejecutar la accion. No confiar en IDs recibidos por parametros sin verificar ownership.

Las rutas API de billing validan sesion cuando inician checkout y reservan el cambio de plan para backend/webhook. El cliente no debe actualizar `plan`, `estado_plan`, `limite_pacientes` ni IDs de Mercado Pago.
