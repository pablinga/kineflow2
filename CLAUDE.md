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
- **Drift QA ↔ prod conocido (previo, no tocado):** en QA no existe `ensure_kinesiologist_personal_workspace` (por eso `/api/workspaces/ensure-personal` falla en QA) y el trigger `ensure_profile_personal_workspace` tiene la lógica inline; `enforce_patient_plan_limit` difiere (QA: límite por workspace; prod: chequeo de solo lectura); `profiles_plan_check` y los triggers `prevent_profile_billing_self_update` / `set_default_plan_values` solo coinciden en QA. Antes de reemplazar una función, comparar la versión live de los dos ambientes.
- **Regiones:** Supabase prod está en `us-west-1` y QA en `us-east-2`. Las funciones de Vercel corren en `sfo1` (`vercel.json`), también en Preview/QA.
- **`supabase-js` ≥ 2.117:** la 2.106 devolvía `data.user = null` en signUps que requieren confirmar email (el RPC de invitación a clínica no corría). No bajar de versión. Con email ya existente, Supabase responde un user con `identities: []` (sin error).
- **Supabase rechaza emails `@example.com`** en el signUp público; los tests crean usuarios con `auth.admin.createUser`.
- `.env.prod.local` tiene `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` con placeholders: para tocar prod usar la CLI (`npx supabase db query --project-ref vpibqrsccntykhdeavbk`).

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

### 2026-09-24 → 2026-10-05 (todo en prod salvo que se indique)

- **Precio por prestador** (`session_price` en obras sociales/ART) y **fechas en hora de Argentina** (`toArgentinaDateValue`, defaults de `evolutions.session_date` / `treatments.started_at` — `202609240002`).
- **Rol RECEPCION** en clínicas (`202609250001`, fix de recursión RLS `202609280001`): igual que el admin salvo Configuración, Reportes, Ingresos, Equipo y Plan; evoluciones/tratamientos en solo lectura. Rutas bloqueadas en `RoleRouteGuard` / `isPathAllowedForRecepcion`.
- **Cuentas de recepción con email y contraseña** (`202610010001`, `/api/reception-members`): account_type `RECEPCION`, sin trial ni workspace personal, acceso = el de su clínica (`get_account_access_level`), `app_metadata.reception_workspace_id` = clínica que la creó (solo esa clínica cambia contraseña / bloquea). Baja = ban. `invite-reception` y `reception-invitations` quedan hasta que no haya invitaciones pendientes (en prod había 1: Rehabimed).
- **QR de reserva online** con logo, una sola descarga (`BookingQrCard`). Los links del QR llevan `?src=qr` → `appointments.booking_source = 'public_qr'`.
- **Panel admin `/admin`** (ver sección propia) y `booking_source` (`202609280002`).
- **Turno simultáneo por turno** (`allows_simultaneous`, `202609300001`): un turno exclusivo ocupa el horario solo; los simultáneos conviven hasta el cupo. Con cupo 1 el checkbox no se muestra.
- **Evaluación kinésica** (`patient_evaluations`, `202609290001`): reemplaza al "tratamiento inicial" del alta; "Crear tratamiento" desde una evaluación (`treatments.evaluation_id`).
- **Tipos de atención** (`attention_types`, `202610010002`) en clínicas y particulares: precargan duración, precio (regla única en `src/lib/attention-pricing.ts`) y simultáneo; el turno guarda una copia del nombre.
- **Nuevo turno en clínicas**: paciente primero (preselecciona su profesional), profesional / "Sin preferencia" + tipo de atención, horarios libres de la semana (`/api/appointments/availability`, `getFreeSlots` en modo `staff`: incluye hoy y feriados marcados) y carga manual como excepción. La duración sale del tipo de atención si hay uno elegido.
- **Mails de invitación** con el mismo diseño que el de confirmación (`src/lib/email-templates.ts`); remitente por defecto `notificaciones@mail.kineflow.ar` (dominio verificado en Resend; `kineflow.ar` raíz no lo está).
- **Middleware solo en `/api`** (CORS de `OPTIONS`, ahora incluye `https://www.kineflow.ar`) y funciones en `sfo1`.
- Ocultar Obra social / ART en nuevo turno y reserva online si no hay prestadores activos; varios arreglos de mobile (grillas con `grid-cols-1` para que textos largos no estiren las tarjetas).
- **Solo en QA** (falta pasar a prod): `supabase-js` 2.117 (arregla la aceptación de invitaciones al registrarse) y la pantalla **"Revisá tu correo"** (`/registro/confirmar`, email por `sessionStorage` `kf_signup_pending`, aviso de email ya registrado, `AuthShell` compartido con el registro).

### Forma de trabajar del usuario

- Suele pedir "commitealo a qa y luego a main" en el mismo mensaje; en ese caso se hace el merge a `main` sin volver a preguntar.
- Para cambios visuales chicos prefiere que se commitee sin correr Playwright (interrumpió esas corridas); para cambios que tocan permisos o datos conviene ofrecer la prueba end-to-end antes de commitear.
- Suele mandar specs largos pegados ("Antes de modificar cada archivo, leelo completo... si algo no coincide, frená"): respetar los pasos de freno, verificar contra la base live y reportar diferencias antes de seguir.
- Cuando pide "mostrame el diff antes de commitear", esperar su OK; "subilo / mandalo a qa" = commit + push a `qa`; "pasalo a prod" = aplicar migraciones pendientes en prod y después mergear `qa` → `main`.

### Panel admin de la plataforma (2026-09-28)

- `/admin` (reporte semanal de KPIs) con login propio, independiente de las cuentas de KineFlow. Variables en Vercel (Preview y Production, valores distintos): `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`. Sin ellas `/admin` responde 404.
- Cambiar la contraseña: `node scripts/admin-password-hash.mjs` y reemplazar `ADMIN_PASSWORD_HASH` en Vercel (invalida las sesiones abiertas). No hay recuperación por mail a propósito.
- Seguridad: cookie firmada HMAC httpOnly/SameSite=strict de 8 h; bloqueo tras 5 fallos en 15 min por IP (50 global) en `admin_login_attempts`; `admin_weekly_kpis()` solo la ejecuta `service_role`.
- `appointments.booking_source` (`manual` | `public_link` | `public_qr`): la reserva pública lo completa (`?src=qr` → `public_qr`). Los turnos online previos se marcaron por la nota "Reserva creada desde enlace público." — `202609280002`, aplicada en QA y prod.

### Atribución de adquisición (UTM, 2026-10-04)

- First touch en el navegador (`src/lib/attribution.ts` lógica pura + `attribution-client.ts` localStorage, vence a 90 días). `<AttributionCapture />` en el layout raíz; `/registro` registra `signup_started` y manda la atribución en `user_metadata.attribution`.
- Base (`202610040001_acquisition_attribution.sql`): `user_attribution` (la llena el trigger `on_auth_user_record_attribution`, nunca bloquea el alta; cada usuario lee solo la suya), `acquisition_events` (landing_view / signup_started vía `/api/acquisition/event`, service role) y `outreach_contacts` (envíos por campaña). Solo slugs en los UTM: un valor con "@" o espacios se descarta.
- Consultas del embudo: `supabase/queries/acquisition-funnel.sql`. Tests: `npm run test:attribution`, `npm run test:attribution:qa` (con `APP_URL` prueba también la API) y `scripts/attribution-e2e.mjs` (Playwright temporal).
- El Supabase rechaza emails `@example.com` en el signUp público: los tests crean usuarios con la API admin.
