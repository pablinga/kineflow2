/**
 * Registro pendiente de confirmar el email: el registro lo guarda en
 * sessionStorage y la pantalla "Revisá tu correo" lo lee. No viaja por la URL
 * (los query strings quedan en logs e historial).
 */
export const SIGNUP_PENDING_STORAGE_KEY = "kf_signup_pending";

export type SignupPending = {
  email: string;
  invited: boolean;
};

export function readSignupPending(): SignupPending | null {
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_PENDING_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<SignupPending>) : null;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      email: typeof parsed.email === "string" ? parsed.email : "",
      invited: parsed.invited === true,
    };
  } catch {
    return null;
  }
}
