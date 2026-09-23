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
- La tabla de bookkeeping de migraciones de Supabase CLI no es confiable en este repo: puede haber migraciones marcadas como aplicadas que en realidad no corrieron en el ambiente (pasó con `202606300002_harden_workspace_rls.sql`, que estaba en el repo pero nunca se había ejecutado contra QA, dejando esas RLS corriendo con funciones viejas). Si algo no se comporta como el código de una migración indica, no asumas que "está en el repo" implica "ya se aplicó" — verificar el estado real (`pg_policies`, `pg_proc`) antes de asumir.
- Para aplicar una migración a un ambiente puntual, usar SQL directo (todo el archivo corre como una sola transacción implícita):
  ```bash
  set -a; source .env.supabase-cli.local; set +a
  npx supabase db query --linked --project-ref <ref> -f supabase/migrations/archivo.sql
  ```
  `.env.supabase-cli.local` (gitignored) tiene `SUPABASE_ACCESS_TOKEN=sbp_...`, generado en https://supabase.com/dashboard/account/tokens. Pasar el token por env var evita que la CLI intente usar el Keychain de macOS (que pide una contraseña que no es la del login de Supabase). No usar `supabase login` interactivo para esto.
- Aplicar primero en QA, verificar, recién después en prod. Antes de mergear `qa` a `main`, chequear si prod le falta alguna migración que ya está en QA (columnas/tablas nuevas que el código ya espera rompen prod si no se aplicaron) — y viceversa, si prod tiene algo que QA no.

## Probar cambios

- Antes de commitear: `npx tsc --noEmit` y `npm run lint` limpios.
- Para probar flujos reales contra QA: crear datos de prueba con un script Node descartable usando el service-role client (`SUPABASE_SERVICE_ROLE_KEY` de `.env.qa.local`), ejercitar la app real (dev server o llamadas directas a los endpoints), y **limpiar los datos de prueba al final** (borrar usuarios/pacientes/turnos creados). Ver `scripts/core-flows-check.mjs` y `scripts/rls-isolation-check.mjs` como referencia de patrón.
- Para verificación visual/UI: instalar Playwright temporalmente (`npm install --no-save playwright && npx playwright install chromium`), tomar capturas o interactuar, y después `npm uninstall playwright` — no debe quedar como dependencia del proyecto.
- Scripts de test permanentes: `npm run test`, `npm run test:rls`, `npm run test:flows`.

## Cosas a tener en cuenta

- `clinic_professionals.status` usa el vocabulario `'pending' | 'active' | 'inactive'`. `workspace_members.status` usa un vocabulario **distinto y no relacionado**: `'pending' | 'accepted' | 'rejected' | 'inactive'`. Son tablas separadas — no asumir que comparten valores.
- El endpoint público de reserva (`/api/public/booking/[workspaceId]`) tiene varias capas de protección (rate limit por IP, rate limit por teléfono, CAPTCHA opcional vía Turnstile, throttle de envío de WhatsApp) — no removerlas sin motivo al tocar ese archivo.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` son opcionales: si no están configuradas, el CAPTCHA queda inactivo y todo sigue funcionando (no-op intencional).
- **RLS y `insert().select()`**: una policy de SELECT que solo llama a una función que busca la fila por id (`can_access_workspace_x(id)`) rechaza el `INSERT ... RETURNING` (la función no ve la fila recién insertada) y la app muestra "No tenés permisos para guardar esos datos". Las policies de SELECT deben evaluar al menos una condición sobre las columnas de la propia fila (ej. `is_workspace_admin(workspace_id) or can_access_workspace_x(id)`). Ver `202609230003_fix_patients_select_on_insert.sql` y `202608300001_fix_treatments_owner_read_access.sql`.
- **Modelo de clínica**: un kinesiólogo particular (cuenta `KINESIOLOGO`, workspace `PERSONAL`) y una clínica (cuenta `CONSULTORIO`, workspace `CLINICA` creado por el alta) son cosas distintas. El equipo de la clínica se arma con `clinic_professionals` (pantalla Equipo = `kinesiologos/page.tsx`); el trigger `sync_clinic_professional_workspace_member` crea el `workspace_members`. Solo el admin de la clínica da de alta pacientes en la clínica; un kinesiólogo del equipo no puede.
- **Limpieza de datos de prueba**: `auth.admin.deleteUser` falla ("Database error deleting user") si el usuario todavía tiene workspaces/clínicas. Borrar antes turnos → pacientes → `clinic_professionals` → workspaces → clínicas, y recién después los usuarios.
- **Carga del dashboard**: sesión, workspace y plan se cargan una sola vez en `AuthSessionContext`; `useAccessLevel` comparte la consulta en curso entre componentes. En hooks client-side usar `auth.getSession()` (local) para obtener el id del usuario, no `auth.getUser()` (hace un round-trip al servidor); la RLS valida igual cada consulta.
- `npm run test` tiene una verificación desactualizada del texto de la landing ("Gestiona tus pacientes, turnos y sesiones") que falla desde el rediseño de la landing; no es una regresión nueva.

## Historial

### 2026-09-23

- **Notificaciones push (PWA)** — en prod. Web Push con VAPID (`web-push`), sin servicios externos.
  - Tablas `push_subscriptions` y `push_notification_log` (anti-duplicados) — `202609230001`. Cron `kineflow-push-daily-agenda` a las 10:00 UTC (07:00 AR) — `202609230002`, usa los mismos secretos de vault que el cron de WhatsApp.
  - Eventos: resumen diario de turnos (a quien atiende: profesional asignado de la clínica o dueño del turno independiente) y aviso al profesional cuando lo suman a una clínica (solo si ya tiene cuenta; si no, sigue el email).
  - Toggle por dispositivo en Configuración (`PushNotificationsCard`). En iOS solo funciona con la PWA instalada (iOS 16.4+).
  - Env vars `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: claves **distintas** en Preview (QA) y Production. Si faltan, push queda desactivado sin romper nada.
- **Performance del dashboard** — en prod. Speed Insights había bajado a 73 (LCP desktop); con muy poco tráfico (~17 mediciones/semana) el puntaje oscila mucho. Se sacaron consultas en serie y duplicadas (plan en una consulta, `useAccessLevel` con `getSession` y consulta compartida, `owner_id` en el workspace activo). LCP medido local contra QA: ~1.15 s → ~0.45–0.65 s. Pendiente posible: no bloquear la página entera hasta que carguen plan y nivel de acceso.
- **Fix RLS alta de pacientes** — aplicado en QA y prod (`202609230003`), también para `appointments`. Se aplicó en QA `202608300001` (treatments), que solo estaba en prod.
- **`test:rls`** reescrito: A y B kinesiólogos particulares, C kinesiólogo del equipo de la clínica, D cuenta CONSULTORIO dueña de la clínica. Verifica aislamiento, que C vea solo pacientes asignados, que D dé de alta pacientes con insert + select y que C no pueda (exige rechazo de RLS `42501`). El cleanup ya no deja usuarios en QA.
- **Configuración**: el botón de "Días bloqueados" desbordaba la tarjeta entre ~1024 y 1280 px; ahora es una fila flexible — en prod.
- Nota: el `CRON_SECRET` de `.env.prod.local` está desactualizado respecto al de Vercel/vault de prod.

### Espacio del kinesiólogo (en prod)

Decisión: un kinesiólogo trabaja **siempre en su espacio particular**; no cambia al workspace de la clínica. Todos los menús (pacientes, ingresos, reportes, etc.) son del particular. Implementado:
- `AuthSessionContext` / `useActiveWorkspace` fijan el espacio activo en el `PERSONAL` para cuentas `KINESIOLOGO` (ignoran el guardado en localStorage) y el sidebar oculta el selector. Los workspaces de clínica siguen en la lista porque la agenda los necesita.
- Agenda y Sesiones diarias usan el modo `unified` **solo para cuentas `KINESIOLOGO`** (turnos con `owner_id` = el kinesiólogo en todos sus workspaces; un turno de clínica se guarda con `owner_id` = profesional asignado). Antes la agenda usaba `unified` para todos y la clínica no veía los turnos de su equipo.
- Turnos de clínica vistos por el kinesiólogo: solo "Asistió / No asistió" (sin cobro, reprogramar, cancelar, firma ni link a la ficha); no dependen de su plan/trial. `/api/appointments/status` rechaza otros estados para turnos `appointment_origin = 'clinic'` si quien llama no es admin.
- La leyenda de la agenda muestra cada clínica activa con su color y días/horarios (`clinic_professional_availability`); Mis consultorios ya los mostraba.
- Se restauró en QA `can_insert_workspace_appointment` (había quedado con `clinic_professionals.status = 'accepted'`, pisada al aplicar tarde `202606300002`); ahora es idéntica a prod y al repo (`202607060001`). `can_access_patient` e `is_assigned_appointment_professional` siguen con `'accepted'` en ambos ambientes pero no las usa nada.

- `202609230004_clinic_professional_appointment_access.sql` (aplicada en QA y prod): el kinesiólogo lee los pacientes de sus propios turnos de clínica mientras el vínculo esté activo (`has_active_clinic_appointment_with_patient`), registra evoluciones de pacientes de clínica solo si `clinic_professionals.can_register_evolutions` (ahora aplicado en `can_insert_workspace_evolution`) y lee las evoluciones que registró.
- En la agenda, un turno de clínica asistido ofrece "Registrar evolución" (`ClinicEvolutionModal`), que guarda con el `workspace_id` del turno; si ya existe muestra "Evolución registrada".

Pendiente posible: "Registrar evolución" también desde Sesiones diarias.

### Otros cambios del 2026-09-23 (en prod)

- **Historial de turnos en la ficha del paciente** (`PatientAppointmentHistory`): todos los turnos, más recientes primero, con origen (particular/clínica), estado y cobro. Permite Asistió / No asistió (no en turnos futuros), Cobrar (mismo formulario que la agenda) y "Marcar pendiente" (`markAppointmentUnpaid` en `useAppointments`). Mismas reglas que la agenda: en un turno de clínica el profesional solo marca asistencia; los particulares respetan el modo solo lectura. Se subió sin prueba end-to-end (solo `tsc` y lint).
- **Documentación del tratamiento** (`TreatmentDocumentation`): un renglón por archivo con el nombre (clic abre el archivo) y los íconos de descargar y eliminar; adjuntar es un ícono de clip. Se quitaron tipo, tamaño, fecha y quién lo subió de la lista.
- **Ficha del paciente**: Tratamientos quedaba 16 px más abajo que Evoluciones porque una sección oculta con la clase `hidden` seguía recibiendo el margen de `space-y`. Para ocultar un hijo dentro de `space-y-*` usar el atributo `hidden`, no la clase.
- **Reporte de sesiones**: columna Hora al lado de Fecha, en la tabla y en el Excel (mismo formato que la agenda).
- **404 de CSS en prod**: pedidos de bots (ej. AhrefsBot) a assets con hash de deploys anteriores. Es inofensivo; las páginas actuales apuntan a assets que existen. Mejora opcional, no aplicada: `src/middleware.ts` usa `matcher: "/:path*"` y se ejecuta en cada pedido (incluidos los estáticos) aunque solo responde preflights CORS (`OPTIONS`); se podría limitar a `/api/:path*`.

### Forma de trabajar del usuario

- Suele pedir "commitealo a qa y luego a main" en el mismo mensaje; en ese caso se hace el merge a `main` sin volver a preguntar.
- Para cambios visuales chicos prefiere que se commitee sin correr Playwright (interrumpió esas corridas); para cambios que tocan permisos o datos conviene ofrecer la prueba end-to-end antes de commitear.
