export const MIN_PASSWORD_LENGTH = 6;

export const PASSWORD_RECOVERY_CONFIRMATION =
  "Si el email está registrado, recibirás un enlace para restablecer tu contraseña.";

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function getBrowserAuthRedirectUrl(path: string) {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}
