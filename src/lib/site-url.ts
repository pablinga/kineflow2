/**
 * URL pública del sitio para canonical, sitemap y llms.txt. El dominio
 * canónico es www.kineflow.ar: kineflow.ar redirige con 308 (Vercel), así que
 * se normaliza para no publicar URLs que redirigen.
 */
export const CANONICAL_SITE_URL = "https://www.kineflow.ar";

export function getSiteUrl(appUrl = process.env.NEXT_PUBLIC_APP_URL) {
  const value = appUrl?.trim();

  if (!value) {
    return CANONICAL_SITE_URL;
  }

  try {
    const url = new URL(value);

    if (url.hostname === "kineflow.ar") {
      url.hostname = "www.kineflow.ar";
    }

    return url.origin;
  } catch {
    return CANONICAL_SITE_URL;
  }
}

/** Producción de Vercel (o local sin VERCEL_ENV): QA/preview no se indexa. */
export function isIndexableDeployment(vercelEnv = process.env.VERCEL_ENV) {
  return !vercelEnv || vercelEnv === "production";
}
