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
- Tests unitarios puros (sin red): `npm run test:attribution`, `npm run test:import`, `npm run test:pwa`. Para correrlos todos juntos usar `node --test` sin argumentos: `node --test tests/` no funciona en Node 22 (toma `tests/` como archivo).

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
- **Ficha del paciente**: Tratamientos quedaba 16 px más abajo que Evoluciones porque una sección oculta con la clase `hidden` seguía recibiendo el margen de `space-y`. Para ocultar un hijo dentro de `space-y-*` usar el atributo `hidden`, no la clase. Ojo con lo inverso: el atributo `hidden` no oculta un elemento que tiene una clase de display (`grid`, `flex`): la utilidad de Tailwind le gana. Ahí alternar la clase (`grid` / `hidden`).
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

### Instalación de la PWA desde el celular (2026-10-08, en prod)

- Botón permanente "Instalar KineFlow" en el menú hamburguesa del dashboard (no en la barra inferior, que tiene 4 columnas fijas) y link discreto en `/login`. Solo en mobile (Android, iOS, navegadores internos de apps); se oculta en escritorio, en modo standalone y después de `appinstalled`.
- Arquitectura: `src/lib/pwa-platform.ts` (detección pura: `getInstallPlatform` → `android` | `ios-safari` | `ios-other` | `in-app` | `desktop` | `unsupported`; iPad con UA de Mac se detecta por `maxTouchPoints > 1`; mobile vs. escritorio combina UA con `pointer: coarse`), `src/lib/pwa-install.ts` (store único: los listeners de `beforeinstallprompt` / `appinstalled` se registran una sola vez desde `PwaInstallCapture` en el layout raíz, para no perder el evento si se entra por `/login`), hook `usePwaInstall`, `PwaInstallButton` y `PwaInstallInstructionsModal` (montado con portal en `document.body`: el `aside` del menú tiene `transform` y confinaría un `fixed`).
- El evento de instalación se usa una sola vez: si el usuario cancela se descarta y el botón pasa a mostrar instrucciones manuales. Nunca se afirma que se instaló sin `appinstalled`.
- El aviso automático (`PwaInstallPrompt`, solo en el dashboard) conserva el cooldown de 7 días (`pwa_install_dismissed_at`); "Ahora no" ya no descarta el evento, así el botón del menú lo sigue usando. En escritorio el aviso sigue como antes.
- Instrucciones por plataforma: Android sin evento (menú ⋮ / Samsung Internet), iOS Safari (iPhone/iPad), Chrome/Edge iOS (Compartir, requiere iOS 16.4+), Firefox iOS y otros → abrir en Safari, Instagram/Facebook/Messenger → "Abrir en el navegador" + copiar link.
- Medición con `@vercel/analytics`: `pwa_install_click` (`platform`, `source`: `menu` | `login` | `banner`) y `pwa_installed`.
- Como el evento se captura en todas las páginas con `preventDefault`, la mini barra de instalación de Chrome ya no aparece tampoco en la landing.
- Probado con Playwright y UAs emulados (evento simulado); falta prueba en dispositivos reales. `PushNotificationsCard` usa `detectStandalone()` de `pwa-install.ts`.
- En los contenedores de Claude Code en la nube `npm ci` falla porque la red bloquea `cdn.sheetjs.com` (dependencia `xlsx`); para correr tsc/lint/tests se instaló con `xlsx@0.18.5` del registry de npm sin commitear `package.json` / lock.

### Mejoras de UX (2026-10-08, en prod)

Revisión de UX del dashboard en tres bloques (commits `4420409`, `b9b8297`, `01479cf` en `qa`).

- **Asistencia y cobro:** `useAttendanceActions` (compartido por Inicio y Agenda) marca Asistió / No asistió en un toque, sin confirmación, con aviso "Deshacer" de 8 s (`UndoToast`). Mismas reglas de siempre: no turnos futuros, respeta solo lectura; en un turno de clínica visto por el profesional solo se deshace entre Asistió y No asistió (la API no le deja volver a pendiente). Para deshacer se usa `Appointment.rawStatus` (estado crudo de la base). Cancelar sigue pidiendo confirmación. Después de Asistió se abre el cobro; un solo formulario `AppointmentPaymentModal` para Inicio, Agenda y la ficha.
- **Inicio:** la tarjeta "Hoy" (`TodayAgendaCard`) lista todos los turnos del día (mismo alcance que la Agenda, `useAppointments` unified para kinesiólogos) con Asistió / No asistió / Cobrar; carga sin bloquear la página. Tarjetas: "Pacientes activos" y "Cobrado este mes" (solo si puede ver Ingresos); los cobros pendientes se muestran en "Requieren acción" con el total real (`count: "exact"`, antes se cortaba en 8).
- **Agenda:** en el celular abre en vista Día y recuerda la vista (`localStorage` `kineflow.agenda.view`; `?vista=dia` fuerza el día de hoy). "Firmar planilla" está en las acciones del turno. **"Asistencia de sesiones" se unificó con la vista Día**: `/dashboard/turnos/hoy` redirige a `/dashboard/turnos?vista=dia` (también el link del push diario) y salió del menú. El chip de cobro se muestra solo si asistió o ya está cobrado (antes había dos "Pendiente"). La vista Semana amplía el rango horario si hay turnos antes de las 8 o después de las 20.
- **Recargas sin pantalla de carga:** `useAppointments`, `usePatients`, `useIncomeRecords` y `useSessionsReport` exponen `initialLoaded`; solo la primera carga bloquea la página. Búsquedas con `useDebouncedValue` (300 ms).
- **Ficha del paciente:** "Editar" abre la edición de la lista con `?editar=<id>&buscar=<DNI>` y vuelve a la ficha; "Registrar cobro" abre el cobro del turno impago más antiguo en la misma ficha. En el celular tiene pestañas (Evoluciones · Turnos y cobros · Evaluación y tratamientos); en escritorio sigue en columnas.
- **Nuevo turno particular:** selector de horarios libres (`SlotPicker`) según `independent_availability` (Reservas online), paciente primero, carga manual como alternativa. `/api/appointments/availability` acepta el workspace `PERSONAL` solo si quien consulta es el `owner_id` (`professionalId` se ignora, la app manda `self`).
- **Configuración:** pestañas General · Atención y coberturas · Agenda · Notificaciones (se puede entrar con `#agenda`, etc.); avisos arriba. Confirmación al borrar obra social, ART o día bloqueado.
- **Equipo:** una sola acción "Dar de baja" (activo) / "Cancelar invitación" (pendiente); los dados de baja se listan al final con "Reactivar" (mismo camino que volver a invitar, conserva horarios). `useClinicKinesiologists` ahora trae también los `inactive`. Tarjetas en el celular.
- **Ingresos vs. Reportes:** se mantienen separados a propósito (Ingresos = cobros a pacientes; Reportes = sesiones con obra social / ART y N° de afiliado para rendir, con Excel). Reportes tiene tarjetas en el celular.
- Pendiente conocido: en la ficha, "Profesional:" muestra al usuario logueado (`displayName`), no al profesional asignado ni al autor de la evolución.
- **Probar en el contenedor de la nube sin credenciales de QA:** dev server con `NEXT_PUBLIC_SUPABASE_URL=http://supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=fake`, sesión falsa en `localStorage` (`sb-supabase-auth-token`) y Playwright interceptando `http://supabase.test/**` y las rutas `/api/...` con datos simulados. Sirve para UI y flujos; no reemplaza probar contra QA. Los estados de turno simulados tienen que ser válidos (`pending`, `attended`, `no_show`, ...) o la agenda falla.

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

### Confirmación por WhatsApp de turnos cargados por el profesional (2026-10-09, solo en QA)

- Al crear un turno desde la agenda (`addAppointment` / `addClinicAppointment`, único camino: `turnos/nuevo`, de a un turno), el hook pide el id con `.select("id").single()` y llama sin esperar a `POST /api/appointments/confirm-notification`. Permisos como crear el turno: particular → su dueño; clínica → staff (ADMIN o RECEPCION), no el profesional del equipo.
- Reglas (`decideAppointmentConfirmation` en `src/lib/appointment-confirmation-rules.ts`, pura y testeada): WhatsApp habilitado, `whatsapp_consent` y `phone_e164` del paciente, turno al menos 30 min en el futuro (los históricos nunca disparan mensajes), sin una confirmación `sent` previa y throttle por teléfono (si lo supera queda `failed` con el mismo mensaje que la reserva online).
- Envío y registro compartidos con la reserva online en `src/lib/appointment-notifications.ts` (plantilla `confirmacion_turno`). `appointment_notifications.notification_type` distingue `confirmation` de `reminder`; el cron solo deduplica por `reminder` + `sent`, así que la confirmación no suprime el recordatorio de 24 h.
- `appointment_notifications` tiene RLS sin policies (solo service role): mostrar el estado del envío en la UI requeriría una policy nueva.
