export const SIGNUPS_CLOSED_MESSAGE =
  "🚀 KineFlow se encuentra actualmente en etapa de acceso limitado.\n\nSi sos kinesiólogo y querés conocer la plataforma o participar de las pruebas iniciales, contactanos.";

export const ACCESS_REQUEST_MAILTO =
  "mailto:contacto@kineflow.ar?subject=Solicitud%20de%20acceso%20a%20KineFlow&body=Hola%2C%20soy%20kinesi%C3%B3logo%2Fa%20y%20me%20interesa%20participar%20de%20las%20pruebas%20de%20KineFlow.";

export function areSignupsEnabled() {
  return process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED !== "false";
}

export function isLoginEnabled() {
  return process.env.NEXT_PUBLIC_LOGIN_ENABLED !== "false";
}

export function arePublicAuthLinksVisible() {
  return (
    process.env.NEXT_PUBLIC_SIGNUPS_ENABLED !== "false" &&
    process.env.NEXT_PUBLIC_PUBLIC_AUTH_LINKS_VISIBLE !== "false"
  );
}
