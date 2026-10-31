# Auditoría responsive de KineFlow (celulares y tablets Android)

Fecha: 31/10/2026. No se modificó código del proyecto.

**Veredicto: casi lista.** Dos errores de maquetación a arreglar antes de publicar (Inicio y Agenda vista Día se ensanchan en el celular; tablas y vista Semana ensanchan la página en tablet horizontal/escritorio), más modales que no entran con el celular acostado. El resto son detalles.

## Cómo se probó

- **Base de datos simulada.** La red del contenedor bloquea `*.supabase.co`: dev server de Next contra un Supabase falso en memoria (`fake-supabase.mjs`, datos en `data.mjs`). Las rutas `/api` de agenda, confirmaciones y push se simularon con Playwright; las de la reserva pública (`/api/public/booking/...`) corrieron de verdad contra el Supabase falso.
- **Datos difíciles a propósito:** nombres de 40 caracteres, obras sociales y emails largos, 10 turnos el mismo día, montos como $ 12.875.000.
- **Tamaños:** Pixel emulado (táctil, densidad 2) 360×800, 390×844, 412×915 y 800×360 acostado; tablet 768×1024; 1024×768 y 1280×800.
- **Alcance:** 48 pantallas o estados en 7 tamaños (~510 capturas), más 17 modales medidos en 360, 800×360 y 768.
- **Chequeos automáticos:** scroll horizontal, elementos fuera de pantalla, áreas táctiles < 40 px, campos con letra < 16 px, modales que no entran o no scrollean. Después, revisión a ojo de las capturas.
- **Arreglos comprobados** inyectando el CSS corregido en el navegador (`verify-fix.mjs`).
- En las capturas de página completa la barra inferior y el encabezado aparecen en el medio: es un efecto de la captura. El botón negro "N" es el indicador de modo desarrollo de Next.

| Qué | Dónde |
|---|---|
| Página completa | `screenshots/<pantalla>__<tamaño>.png` |
| Final de la página | `screenshots/<pantalla>__<tamaño>__bottom.png` |
| Modales | `screenshots/modal-<nombre>__<tamaño>.png` |
| Resultados crudos | `results-all.json`, `modals.json` |

## Problemas priorizados

### Crítico

**C1. El Inicio queda más ancho que el celular** (360, 390, 412; kinesiólogo y clínica)
- La grilla no define columnas en el celular; su única columna toma el ancho del texto más largo (un nombre en "Hoy") y la página mide 450 px.
- Capturas: `screenshots/kine-inicio__360.png`, `kine-inicio__390.png`, `admin-inicio__360.png`.
- Archivo: `src/app/dashboard/page.tsx:382`.
- Arreglo: `grid grid-cols-1 items-start ... lg:grid-cols-2 xl:grid-cols-3`. Comprobado: 450 → 360.

**C2. La Agenda en vista Día se ensancha y corta los modales** (360, 390, 412)
- La página mide 443–460 px; los modales se centran sobre ese ancho y quedan cortados (Acciones del turno a la izquierda en 360, Registrar evolución a la derecha en 390).
- Capturas: `kine-agenda-dia__360.png`, `modal-acciones-turno__360.png`, `kine-agenda-evolucion__390.png`, `kine-agenda-cobro__390.png`.
- Archivo: `src/app/dashboard/turnos/page.tsx:1958`.
- Arreglo: `grid grid-cols-1 gap-4 lg:grid-cols-3`. Comprobado: 460 → 360.
- Recomendación: revisar todas las grillas sin `grid-cols-*` en el celular que contienen texto largo.

### Importante

**I1. En tablet horizontal (1024) y escritorio la página scrollea de costado**
- Reportes (1024 y 1280), Ingresos (1024), Equipo (1024 y 1280), Agenda vista Semana (1024).
- Causa: `lg:grid-cols-[18rem_1fr]` (`1fr` no deja la columna más angosta que su contenido). Repetido en 22 lugares (`grep -rn "grid-cols-\[18rem_1fr\]" src`), por ejemplo `src/app/dashboard/reportes/page.tsx:146`, `ingresos/page.tsx:171`, `kinesiologos/page.tsx:1024`, `turnos/page.tsx:1743`, `src/components/turnos/ClinicAgenda.tsx:767`.
- Arreglo: `lg:grid-cols-[18rem_minmax(0,1fr)]` (ideal: un componente de layout compartido).
- Comprobado: Reportes 1587 → 1024, Ingresos 1250 → 1024, Equipo 1479 → 1024.
- Capturas: `kine-reportes__1024.png`, `kine-ingresos__1024.png`, `admin-equipo__1024.png`, `kine-agenda-semana__1024.png`.

**I2. Modales que no entran con el celular acostado (800×360)**
- Reprogramar: va de −61 a 421 px; "Cancelar" y "Guardar nueva fecha" quedan fuera y no se puede scrollear.
- Firma: título cortado arriba y "Guardar firma" pegado abajo. Acciones del turno: pierde el título.
- Capturas: `modal-reprogramar__800h.png`, `modal-firma__800h.png`, `modal-acciones-turno__800h.png`.
- Archivos: `turnos/page.tsx:2117-2119` y `:2021-2022`, `SignaturePad.tsx:98-99`, `ClinicAgenda.tsx:1069-1070`, `pacientes/[id]/page.tsx:1545-1546` y `:1600`.
- Arreglo: `max-h-[90dvh] overflow-y-auto` en el panel (como AppointmentPaymentModal y AppointmentEvolutionModal); en la firma, limitar el alto del área.
- Entran bien: cobro, evolución, nuevo paciente con evaluación, orden médica, tratamiento, importar, agregar profesional, instrucciones de instalación.

**I3. Botones de cada turno de 32 px** ("Registrar evolución", "Marcar asistió", "Acciones": `min-h-8`, `text-[0.68rem]`)
- Archivo: `turnos/page.tsx:821`, `835`, `1520`, `1539`, `1547`.
- Arreglo: `min-h-11` y `text-xs`/`text-sm` en el celular.

**I4. Vista Semana: mal en el celular y filas desalineadas**
- `min-w-[56rem]`: en el celular se ven ~2,5 días con nombres cortados.
- Cada columna arma sus filas de hora por separado: un día con turnos crece y las horas se desalinean (en todos los tamaños).
- Capturas: `kine-agenda-semana__390.png`, `kine-agenda-semana__1280.png`.
- Archivo: `turnos/page.tsx:1656-1735`.
- Arreglo: filas de hora compartidas; en el celular, 3 días u ocultar Semana.

### Menor

- **M1. Pestañas que scrollean sin avisar** en Configuración y ficha del paciente (`configuracion/page.tsx:447`, `pacientes/[id]/page.tsx:976`). Arreglo: dos filas, desplegable o degradé en el borde y llevar a la vista la activa.
- **M2. Celular acostado:** encabezado (64 px) + barra inferior (69 px) = 37 % del alto en 800×360 (`DashboardSidebar.tsx:273`, `:393`). Arreglo: media query horizontal baja o `orientation: "portrait"` en el manifest.
- **M3. Áreas táctiles chicas** (en 360): cerrar 36×36 (`turnos/page.tsx:376`, cruz de Acciones del turno); cerrar firma ~20 px (`SignaturePad.tsx:102-107`); historial de la ficha 36 px (`PatientAppointmentHistory.tsx:215`, `233`, `252`); ícono de Ingresos 34 px (`ingresos/page.tsx:422`); "Volver a hoy" y "Cambiar" 20 px (`ClinicAgenda.tsx:984`, `ClinicBookingPanel.tsx:361`); "Eliminar día bloqueado" 27 px de ancho, falta `shrink-0` (`configuracion/page.tsx:993`); menú de la landing 28 px, falta `shrink-0` (`PublicNavbar.tsx:47-49`); puntitos del carrusel 8 px (`TestimonialsCarousel.tsx:66-71`); links legales del pie 16–20 px. Mínimo recomendado 44×44.
- **M4. Letra muy chica:** 23 usos de `text-[0.62rem]` / `text-[0.68rem]` en chips y botones de la agenda. Mínimo `text-xs`.
- **M5. Campos con letra de 14 px** (`text-sm`): en Android no hace zoom; solo afecta iPhone (`text-base sm:text-sm`).
- **M6. Textos cortados que no impiden usar:** select "Tipo de atención" (`ClinicAgenda.tsx:808`), campo para agregar obra social angosto, título de orden médica en columna angosta en la ficha, radio "Obra social" en dos líneas en la reserva online.
- **M7. Celdas del calendario del mes son `div` con clic** (`turnos/page.tsx:1586`): sin teclado ni lector de pantalla; el informe previo al lanzamiento de Play Console puede marcarlo.
- **M8. `viewportFit: "cover"`** falta en `src/app/layout.tsx:49` (`env(safe-area-inset-bottom)` vale 0). Hoy no afecta a la app de Play.

## Pantallas que se ven bien

- Públicas: landing, login, registro, "Revisá tu correo", recuperar contraseña, legales, perfil público y reserva online (particular y clínica).
- Inicio de cuenta nueva con el checklist.
- Agenda: vista Mes y hoja de turnos del día.
- Agenda de clínica "Dar turno" (admin y recepción): panel a pantalla completa y "Guardar turno" fijo abajo.
- Nuevo turno con selección de horarios y "Repetir este turno".
- Pacientes (tarjetas, lista, alta con mapa corporal, importar) y ficha (pestañas, historial, órdenes, evaluaciones, tratamientos).
- Ingresos y Reportes en el celular, Configuración (salvo M1), Reservas online, Planes, Equipo en el celular.
- La barra inferior no tapa contenido; gráficos legibles en 360 una vez arreglado C1; tablet vertical (768) todo bien.

## Lo que no se pudo probar

- Supabase real (red bloqueada): todo con datos simulados.
- Dispositivos reales: teclado virtual, gesto "atrás" de Android, app instalada.
- Fechas y horas en formato de EE.UU. en las capturas: es el idioma del Chromium del contenedor, no la app.
- Firmar con el dedo, subir archivos, descargar Excel o QR; push y Mercado Pago fuera de alcance.
- Recepción solo en la agenda; no se armó la vista del profesional del equipo de una clínica.
- Falso positivo: Pacientes en 1280 marca 19 px de más sin elemento visible que sobresalga (probablemente la barra de scroll).

## Play Store / TWA

**Ya está:** manifest en `src/app/manifest.ts` (nombre, nombre corto, descripción, `start_url: /dashboard`, `display: standalone`, colores, íconos 192, 512 y 512 maskable con el logo en la zona segura), `theme-color` y meta viewport correctos, service worker `public/sw.js` con push, el aviso/botón "Instalar" se ocultan dentro de la app instalada.

**Falta:**
1. **`/.well-known/assetlinks.json` (imprescindible).** Sin él la app abre con la barra de Chrome. Se genera con Bubblewrap o PWABuilder con la huella SHA-256 de la firma (la de Play App Signing si se usa) y se sirve desde `https://www.kineflow.ar` (`kineflow.ar` redirige con 308).
2. **Completar el manifest:** `id`, `scope: "/"`, `lang: "es-AR"`, `dir`; `orientation: "portrait"` (evita M2 e I2 en teléfonos); `screenshots` (angosto y ancho) y `categories`. Opcional: `shortcuts`, ícono maskable de 192, `start_url` con `?source=twa`.
3. **Página offline:** el service worker solo guarda íconos; sin conexión aparece el error de Chrome. Recomendado: `/offline` simple.
4. **Ícono de Apple:** `icons.apple` apunta a un SVG que iOS no usa (no afecta Android).
5. **Push en la app de Play:** activar la delegación de notificaciones de Bubblewrap; en Android 13+ pedir el permiso.

**Políticas de Google Play a revisar:**
- **Borrado de cuenta:** Play exige poder pedirlo desde la app y desde una página web. No existe en el código.
- **Cobro de la suscripción con Mercado Pago:** puede chocar con la regla de Google Play Billing. No verificado; confirmar para Argentina o no mostrar el pago dentro de la app.
- **Datos de salud:** completar *Data safety* y posiblemente la declaración de apps de salud.

## Arreglos comprobados (CSS inyectado, sin tocar código)

| Pantalla | Tamaño | Antes (px) | Después (px) |
|---|---|---|---|
| Inicio (kinesiólogo) | 360 | 450 | 360 |
| Inicio (clínica) | 360 | 450 | 360 |
| Agenda, vista Día | 360 | 460 | 360 |
| Reportes | 1024 | 1587 | 1024 |
| Ingresos | 1024 | 1250 | 1024 |
| Equipo | 1024 | 1479 | 1024 |
| Reportes | 1280 | 1587 | 1280 |

## Archivos de la auditoría (sin agregar a git)

- `fake-supabase.mjs`, `data.mjs`: Supabase falso y datos.
- `harness.mjs`: sesión falsa, simulación de `/api` y chequeos.
- `audit.mjs`: recorrido de pantallas. `modals.mjs`: medición de modales. `verify-fix.mjs`: comprobación de arreglos. `summarize.py`: resumen.
- `screenshots/`, `results-all.json`, `modals.json`.

Para repetir:
1. `node responsive-audit/fake-supabase.mjs`
2. `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54331 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon SUPABASE_SERVICE_ROLE_KEY=fake-service NEXT_PUBLIC_APP_URL=http://localhost:3100 npx next dev -p 3100`
3. `node responsive-audit/audit.mjs`
