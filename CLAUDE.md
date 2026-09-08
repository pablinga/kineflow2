# KineFlow — contexto de trabajo

App de gestión clínica (turnos, pacientes, evoluciones, cobros, reserva pública) para kinesiólogos y clínicas de rehabilitación. Next.js 15 (App Router) + TypeScript + Tailwind + Supabase, desplegado en Vercel (proyecto `kineflow2`, dominio `kineflow.ar`).

## Ambientes

- **QA**: proyecto Supabase `ttqngkxfsladketsrnfj` (`qa.kineflow.ar`), rama `qa`.
- **Producción**: proyecto Supabase `vpibqrsccntykhdeavbk` (`kineflow.ar`), rama `main`.
- Variables reales en `.env.qa.local` / `.env.prod.local` / `.env.local` (gitignored). Para levantar el dev server apuntando a QA:
  ```bash
  set -a; source .env.qa.local; set +a
  npm run dev
  ```

## Flujo git

- Se trabaja siempre sobre `qa`. Commitear a `qa` y mergear `qa` → `main` **solo cuando el usuario lo pide explícitamente** (ej. "commitealo a qa", "mergeá qa a main"). Nunca por iniciativa propia.
- Mergear a `main` dispara un deploy de producción en Vercel automáticamente.
- Si `git push` falla con 403 (permission denied), la cuenta activa de `gh` es la que no tiene permiso. Cambiar con:
  ```bash
  gh auth switch --hostname github.com --user pablinga
  gh auth setup-git
  ```

## Base de datos / migraciones

- Los archivos van en `supabase/migrations/`, nombrados `YYYYMMDDNNNN_descripcion.sql`. **Revisar que el timestamp no esté ya usado** antes de crear uno nuevo (es común hacer varias features el mismo día).
- La tabla de bookkeeping de migraciones de Supabase CLI no es confiable en este repo. Para aplicar una migración a un ambiente puntual, usar SQL directo (todo el archivo corre como una sola transacción implícita):
  ```bash
  npx supabase db query --linked --project-ref <ref> -f supabase/migrations/archivo.sql
  ```
- Aplicar primero en QA, verificar, recién después en prod. Antes de mergear `qa` a `main`, chequear si prod le falta alguna migración que ya está en QA (columnas/tablas nuevas que el código ya espera rompen prod si no se aplicaron).

## Probar cambios

- Antes de commitear: `npx tsc --noEmit` y `npm run lint` limpios.
- Para probar flujos reales contra QA: crear datos de prueba con un script Node descartable usando el service-role client (`SUPABASE_SERVICE_ROLE_KEY` de `.env.qa.local`), ejercitar la app real (dev server o llamadas directas a los endpoints), y **limpiar los datos de prueba al final** (borrar usuarios/pacientes/turnos creados). Ver `scripts/core-flows-check.mjs` y `scripts/rls-isolation-check.mjs` como referencia de patrón.
- Para verificación visual/UI: instalar Playwright temporalmente (`npm install --no-save playwright && npx playwright install chromium`), tomar capturas o interactuar, y después `npm uninstall playwright` — no debe quedar como dependencia del proyecto.
- Scripts de test permanentes: `npm run test`, `npm run test:rls`, `npm run test:flows`.

## Cosas a tener en cuenta

- `clinic_professionals.status` usa el vocabulario `'pending' | 'active' | 'inactive'`. `workspace_members.status` usa un vocabulario **distinto y no relacionado**: `'pending' | 'accepted' | 'rejected' | 'inactive'`. Son tablas separadas — no asumir que comparten valores.
- El endpoint público de reserva (`/api/public/booking/[workspaceId]`) tiene varias capas de protección (rate limit por IP, rate limit por teléfono, CAPTCHA opcional vía Turnstile, throttle de envío de WhatsApp) — no removerlas sin motivo al tocar ese archivo.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` son opcionales: si no están configuradas, el CAPTCHA queda inactivo y todo sigue funcionando (no-op intencional).
