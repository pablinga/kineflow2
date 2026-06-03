export const SIGNUPS_CLOSED_MESSAGE =
  "Por el momento el registro se encuentra cerrado. Si querés probar KineFlow, contactanos.";

export function areSignupsEnabled() {
  return process.env.NEXT_PUBLIC_SIGNUPS_ENABLED !== "false";
}
