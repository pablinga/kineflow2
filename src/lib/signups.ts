export const SIGNUPS_CLOSED_MESSAGE =
  "Por el momento el registro se encuentra cerrado. Si querés probar KineFlow, contactanos.";

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
