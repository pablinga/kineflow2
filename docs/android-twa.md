# KineFlow en Google Play (Android, TWA)

La app de Google Play es una **Trusted Web Activity (TWA)**: abre `https://www.kineflow.ar` en pantalla completa con Chrome. No tiene código propio. Cada deploy a producción actualiza la app sin pasar por Google Play; solo hace falta subir una versión nueva si cambia algo de `android/twa-manifest.json` (nombre, ícono, colores, URL de inicio).

En el repo solo se versionan `android/twa-manifest.json` y esta guía. El proyecto Gradle se regenera con Bubblewrap, y la clave de firma y los builds están en `.gitignore`. **Nunca commitear `android.keystore` ni su contraseña.**

## Datos fijos

| Dato | Valor |
|---|---|
| Package name | `ar.kineflow.app` (**no se puede cambiar después de la primera subida a Play**; también está en `src/lib/android-app.ts`) |
| Dominio | `www.kineflow.ar` (con www: `kineflow.ar` redirige con 308 y Android no sigue redirecciones para verificar el dominio) |
| URL de inicio | `/dashboard?app=android` (sin sesión, la web manda al login) |
| Alias de la clave de subida | `kineflow` |

## Lado web (ya está en el repo)

| Pieza | Dónde |
|---|---|
| Manifest (nombre, `start_url`, `scope`, `display: standalone`, colores, `lang: es-AR`, íconos 192/512 y maskable) | `src/app/manifest.ts` |
| Service worker: notificaciones push, íconos en caché y pantalla **Sin conexión** (`public/offline.html`) cuando falla una navegación. Las páginas de la app nunca se guardan en caché porque tienen datos de pacientes. | `public/sw.js` |
| Digital Asset Links: `/.well-known/assetlinks.json` lo arma la ruta `/api/android/assetlinks` (rewrite en `next.config.ts`) con la variable `ANDROID_APP_SHA256_FINGERPRINTS`. Sin la variable responde `[]` y la app abre con la barra de Chrome. **No crear `public/.well-known/assetlinks.json`**: un archivo en `public/` le gana al rewrite y taparía las huellas reales. | `src/app/api/android/assetlinks/route.ts`, `src/lib/android-app.ts` |
| La web detecta que corre dentro de la app por `?app=android` o por el referrer `android-app://ar.kineflow.app`, y lo guarda en `sessionStorage` (la TWA comparte `localStorage` con Chrome). Dentro de la app no se ofrece "Instalar KineFlow". | `src/lib/android-app.ts`, `src/components/AndroidAppCapture.tsx`, `src/lib/pwa-install.ts` |
| En la app, `/dashboard/planes` no muestra el checkout de Mercado Pago (política de pagos de Play); muestra el estado del plan y deja cancelar. | `src/app/dashboard/planes/page.tsx`, `src/hooks/useIsAndroidApp.ts` |
| Baja de cuenta (la pide Play): `https://www.kineflow.ar/eliminar-cuenta` | `src/app/eliminar-cuenta/page.tsx` |
| Baja de cuenta **desde la app** (también la pide Play): Configuración → General → "Eliminar mi cuenta". Manda un mail a `ACCOUNT_DELETION_EMAIL` (por defecto `contacto@kineflow.ar`) con los datos para procesarla y otro de confirmación al usuario; no borra nada sola. Sin `RESEND_API_KEY` responde 503 y pide escribir por mail. | `src/components/configuracion/DeleteAccountCard.tsx`, `src/app/api/account/deletion-request/route.ts`, `src/lib/account-deletion.ts` (`npm run test:deletion`) |

Chequeo de Asset Links de un ambiente (200, JSON, sin redirecciones; con `--require-fingerprints` exige la entrada de `ar.kineflow.app` con huellas válidas):

```bash
npm run check:assetlinks -- https://qa.kineflow.ar
npm run check:assetlinks -- https://www.kineflow.ar --require-fingerprints
```

## Por qué Bubblewrap y no PWABuilder

PWABuilder es más fácil la primera vez (todo desde la web), pero cada versión nueva vuelve a armarse a mano y la configuración no queda en el repo. Bubblewrap usa `android/twa-manifest.json`, que ya está versionado, y genera el mismo resultado cada vez con dos comandos. Además, PWABuilder usa Bubblewrap por dentro, así que no se gana nada técnico. Para KineFlow, que ya tiene el `twa-manifest.json` armado, Bubblewrap es lo más simple.

## Generar el `.aab` (primera vez)

Desde la carpeta `android/`:

```bash
# 1. Generar el proyecto Gradle. La primera vez Bubblewrap ofrece descargar
#    el JDK 17 y el Android SDK en ~/.bubblewrap: aceptar las dos cosas.
#    Usar siempre la última versión: Play exige un target API reciente.
npx @bubblewrap/cli@latest update --skipVersionUpgrade

# 2. Crear la clave de subida (una sola vez). Pide una contraseña.
KEYTOOL="$(find ~/.bubblewrap/jdk -path '*bin/keytool' | head -1)"
"$KEYTOOL" -genkeypair -v -keystore android.keystore -alias kineflow \
  -keyalg RSA -keysize 2048 -validity 10000

# 3. Compilar. Pide la contraseña de la clave; genera app-release-bundle.aab
#    (para Play) y app-release-signed.apk (para instalar a mano).
npx @bubblewrap/cli@latest build
```

## La clave de firma

- Dejar activado **Play App Signing** (es la opción por defecto al crear la app). Google firma la app con su propia clave; la tuya (`android.keystore`) es solo la **clave de subida**.
- Guardar `android.keystore` y su contraseña **fuera de la computadora y fuera del repo** (por ejemplo, en un gestor de contraseñas, como archivo adjunto). Está en `.gitignore`: no forzar nunca su commit.
- Si se pierde la clave de subida, con Play App Signing se puede pedir un reemplazo desde Play Console (lleva unos días). Sin Play App Signing no se podría volver a actualizar la app.

## Huellas SHA-256 y `assetlinks.json`

1. Subir el primer `.aab` a **Prueba interna** en Play Console.
2. Copiar las huellas desde *Prueba y lanzamiento → Configuración → Integridad de la app → Firma de apps*: la de la **clave de firma de apps** (la de Google, es la que usa la app instalada desde Play) y la de la **clave de subida** (sirve para el `.apk` que instalás a mano).
3. En Vercel, cargar `ANDROID_APP_SHA256_FINGERPRINTS` con las dos huellas separadas por coma: en **Production** para `www.kineflow.ar` y, si querés probar contra QA, también en **Preview**. Redeployar.
4. Verificar:
   - `npm run check:assetlinks -- https://www.kineflow.ar --require-fingerprints`
   - El verificador de Google: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.kineflow.ar&relation=delegate_permission/common.handle_all_urls`
   - Al abrir la app no se tiene que ver la barra de direcciones de Chrome. Si se ve, las huellas no coinciden.

La huella de la clave de subida también se ve en local con `"$KEYTOOL" -list -v -keystore android.keystore -alias kineflow`.

## Versiones nuevas

```bash
npx @bubblewrap/cli@latest update   # sube appVersionCode y regenera el proyecto
npx @bubblewrap/cli@latest build
```

Commitear el `android/twa-manifest.json` actualizado y subir el `.aab` nuevo a Play Console.

## Ficha de Play: materiales

| Material | Requisito de Play | Estado en el repo |
|---|---|---|
| Ícono | 512×512 PNG | **Está**: `public/icon-512.png` (512×512). Play aplica su propia máscara redondeada. |
| Imagen destacada | 1024×500 PNG o JPG | **Falta** |
| Capturas de teléfono | 2 a 8, vertical, lado corto ≥ 320 px | **Faltan**. Las de `public/images/landing/` son de escritorio (2560×1600) y no sirven como capturas de teléfono. |
| Descripción corta | hasta 80 caracteres | **Falta**. Base: subtítulo del hero en `src/app/page.tsx` / `LANDING_DESCRIPTION` en `src/lib/landing-content.ts`. |
| Descripción larga | hasta 4000 caracteres | **Falta**. Base: textos de la landing y `LANDING_FAQ` (solo afirmaciones verificadas). |
| Categoría | una de la lista de Play | Decisión pendiente (por ejemplo, Medicina o Empresa). |
| Clasificación de contenido | cuestionario en Play Console | Se completa en Play Console. |
| Seguridad de los datos | formulario en Play Console | Se completa en Play Console (ver abajo). |
| Declaración de apps de salud | formulario en Play Console | Se completa en Play Console: la app maneja historias clínicas cargadas por profesionales. |
| Política de privacidad | URL pública | `https://www.kineflow.ar/politica-de-privacidad` (revisar el texto, ver abajo) |
| Eliminación de la cuenta | URL pública | `https://www.kineflow.ar/eliminar-cuenta` |
| Mail de contacto | obligatorio | `contacto@kineflow.ar` (ya se usa en la web y en las páginas legales) |

### Seguridad de los datos (lo que hay que declarar)

Según el código actual:

- **Información personal** del profesional: nombre, email, teléfono (cuenta).
- **Información de salud**: datos de pacientes que carga el profesional (evaluaciones, evoluciones, tratamientos, órdenes médicas y archivos adjuntos).
- **Información financiera**: estado de la suscripción. Los pagos los procesa Mercado Pago fuera de la app.
- **Actividad en la app / diagnóstico**: Vercel Analytics y Speed Insights (sin cookies).
- **Identificadores**: suscripción a notificaciones push (por dispositivo).
- Datos cifrados en tránsito (HTTPS). Se puede pedir la eliminación (`/eliminar-cuenta`).
- Proveedores que procesan datos por cuenta de KineFlow: Supabase (base y archivos), Vercel (hosting), Resend (emails), Meta / WhatsApp Cloud API (recordatorios a pacientes), Cloudflare Turnstile (anti-bots en la reserva online) y Mercado Pago (cobros). Play no cuenta como "compartir" lo que hace un proveedor por tu cuenta, pero conviene que la política de privacidad los nombre a todos.

## Requisitos de la cuenta de Play

- **Prueba cerrada**: las cuentas de desarrollador personales creadas desde noviembre de 2023 necesitan 12 testers durante 14 días antes de publicar en producción. Las cuentas de organización no.
- **Pagos**: dentro de la app no se puede vender suscripciones digitales con otro medio de pago ni dirigir a pagar fuera de Play. Confirmar la política vigente antes de enviar a revisión.
