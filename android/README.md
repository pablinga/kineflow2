# App de Android (TWA)

La app de Google Play es una **Trusted Web Activity**: abre `https://www.kineflow.ar` en pantalla completa con Chrome. No tiene código propio, así que cada deploy a producción actualiza la app sin pasar por Google Play.

En el repo solo se versionan `twa-manifest.json` y este README. El proyecto Gradle se regenera con Bubblewrap, y la clave de firma y los builds están en `.gitignore`.

## Datos fijos

| Dato | Valor |
|---|---|
| Package name | `ar.kineflow.app` (**no se puede cambiar después de la primera subida a Play**; también está en `src/lib/android-app.ts`) |
| Dominio | `www.kineflow.ar` (con www: `kineflow.ar` redirige) |
| URL de inicio | `/dashboard?app=android` |
| Alias de la clave | `kineflow` |

## Lado web (ya está en el repo)

- `/.well-known/assetlinks.json` → `src/app/api/android/assetlinks/route.ts`. Arma la respuesta con la variable `ANDROID_APP_SHA256_FINGERPRINTS`; sin ella devuelve `[]` y la app abre con la barra de Chrome.
- La web se da cuenta de que corre en la app por `?app=android` o por el referrer `android-app://ar.kineflow.app`, y lo guarda en `sessionStorage`, no en `localStorage`, porque la TWA comparte almacenamiento con Chrome. En la app, `/dashboard/planes` no muestra el checkout de Mercado Pago (política de pagos de Google Play); muestra el estado del plan y deja cancelar la suscripción.
- `/eliminar-cuenta`: URL pública para pedir la baja de la cuenta, que exige Google Play.

## Primera vez

Desde esta carpeta (`android/`):

```bash
# 1. Generar el proyecto Gradle. La primera vez Bubblewrap ofrece descargar
#    el JDK 17 y el Android SDK en ~/.bubblewrap: aceptar las dos cosas.
npx @bubblewrap/cli update --skipVersionUpgrade

# 2. Crear la clave de subida (una sola vez). Pide una contraseña.
KEYTOOL="$(find ~/.bubblewrap/jdk -path '*bin/keytool' | head -1)"
"$KEYTOOL" -genkeypair -v -keystore android.keystore -alias kineflow \
  -keyalg RSA -keysize 2048 -validity 10000

# 3. Compilar. Pide la contraseña de la clave; genera app-release-bundle.aab
#    (para Play) y app-release-signed.apk (para instalar a mano).
npx @bubblewrap/cli build
```

**Guardá `android.keystore` y su contraseña fuera de la computadora**, por ejemplo en un gestor de contraseñas. Con Play App Signing, Google firma la app con su propia clave y esta es solo la de subida: si se pierde se puede pedir un reemplazo, pero hay que pasar por el soporte de Google.

## Publicar en Play Console

1. Crear la app en Play Console y dejar activado **Play App Signing** (es la opción por defecto).
2. Subir `app-release-bundle.aab` a **Prueba interna** para probarla.
3. Copiar las huellas SHA-256 desde *Prueba y lanzamiento → Configuración → Integridad de la app → Firma de apps*: la de la **clave de firma de apps** y la de la **clave de subida**.
4. En Vercel (Production), cargar `ANDROID_APP_SHA256_FINGERPRINTS` con las dos huellas separadas por coma y redeployar.
5. Verificar:
   - `curl https://www.kineflow.ar/.well-known/assetlinks.json` tiene que mostrar el package y las dos huellas.
   - El verificador de Google: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.kineflow.ar&relation=delegate_permission/common.handle_all_urls`
   - Al abrir la app no tiene que verse la barra de direcciones de Chrome. Si se ve, las huellas no coinciden.

La huella de la clave de subida también se puede ver en local con `"$KEYTOOL" -list -v -keystore android.keystore -alias kineflow`.

## Requisitos de la ficha de Play

- **Prueba cerrada**: las cuentas de desarrollador personales creadas desde noviembre de 2023 necesitan 12 testers durante 14 días antes de publicar en producción. Las cuentas de organización no.
- **Apps de salud**: completar la declaración de apps de salud (la app maneja datos de pacientes).
- **Seguridad de los datos**: declarar los datos que se recopilan (cuenta, datos de pacientes, pagos por Mercado Pago fuera de la app).
- **Política de privacidad**: `https://www.kineflow.ar/politica-de-privacidad`.
- **Eliminación de la cuenta**: `https://www.kineflow.ar/eliminar-cuenta`.
- **Pagos**: dentro de la app no se puede vender ni dirigir a pagar fuera de Google Play. Confirmar la política vigente antes de enviar a revisión.

## Versiones nuevas

Solo hace falta una versión nueva si cambia algo de `twa-manifest.json` (nombre, ícono, colores, URL de inicio). Los cambios de la web llegan solos.

```bash
npx @bubblewrap/cli update   # sube appVersionCode y regenera el proyecto
npx @bubblewrap/cli build
```

Commitear el `twa-manifest.json` actualizado y subir el `.aab` nuevo a Play Console.
