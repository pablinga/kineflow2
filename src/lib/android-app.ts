/**
 * App de Android (Trusted Web Activity, carpeta android/): es la misma web
 * abierta por Chrome en pantalla completa. Google Play no permite cobrar
 * suscripciones digitales con otro medio de pago dentro de la app, así que la
 * web oculta el checkout de Mercado Pago cuando corre ahí.
 *
 * La TWA comparte cookies y localStorage con Chrome: la marca se guarda en
 * sessionStorage (es por pestaña) para no ocultar nada en el navegador común.
 */

/** Tiene que coincidir con packageId de android/twa-manifest.json. */
export const ANDROID_APP_PACKAGE_ID = "ar.kineflow.app";

/** La TWA abre startUrl con este parámetro (android/twa-manifest.json). */
export const ANDROID_APP_QUERY_PARAM = "app";
export const ANDROID_APP_QUERY_VALUE = "android";

const SESSION_KEY = "kf_android_app";

/**
 * true si la página se abrió desde la app: por el parámetro de startUrl o por
 * el referrer que pone Android al lanzar la TWA (android-app://<package>).
 */
export function isAndroidAppLaunch(input: { referrer: string; search: string }) {
  if (input.referrer.startsWith(`android-app://${ANDROID_APP_PACKAGE_ID}`)) {
    return true;
  }

  return (
    new URLSearchParams(input.search).get(ANDROID_APP_QUERY_PARAM) ===
    ANDROID_APP_QUERY_VALUE
  );
}

/** Marca la pestaña si se abrió desde la app. Se llama desde el layout raíz. */
export function captureAndroidApp() {
  try {
    if (
      isAndroidAppLaunch({
        referrer: document.referrer,
        search: window.location.search,
      })
    ) {
      window.sessionStorage.setItem(SESSION_KEY, "1");
    }
  } catch {
    // Sin sessionStorage se toma como navegador común.
  }
}

export function detectAndroidApp() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Contenido de /.well-known/assetlinks.json: vincula el dominio con la app
 * para que Android la abra sin la barra de Chrome. `fingerprints` son los
 * SHA-256 de los certificados (el de Play App Signing y, opcional, el de
 * subida), separados por coma o espacio.
 */
export function buildAssetLinks(fingerprints: string | undefined) {
  const values = (fingerprints ?? "")
    .split(/[\s,]+/)
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));

  if (values.length === 0) {
    return [];
  }

  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: ANDROID_APP_PACKAGE_ID,
        sha256_cert_fingerprints: values,
      },
    },
  ];
}
