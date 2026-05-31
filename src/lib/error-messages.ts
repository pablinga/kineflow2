const fallbackMessage =
  "Algo no salio bien. Intentá nuevamente en unos segundos.";

const connectionMessage =
  "No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.";

const knownErrorMessages: Array<[RegExp, string]> = [
  [/invalid login credentials/i, "El email o la contraseña no son correctos."],
  [/email not confirmed/i, "Todavía falta confirmar tu email."],
  [/user already registered/i, "Ya existe una cuenta registrada con este email."],
  [/password should be at least 6 characters/i, "La contraseña debe tener al menos 6 caracteres."],
  [/invalid password/i, "La contraseña no cumple con los requisitos."],
  [/weak password/i, "La contraseña no cumple con los requisitos."],
  [/signup is disabled/i, "El registro no está disponible en este momento."],
  [/email rate limit exceeded/i, "Se enviaron demasiados emails. Esperá unos minutos y volvé a intentar."],
  [/otp expired|token.*expired/i, "El enlace venció. Pedí uno nuevo para continuar."],
  [/unauthorized|permission denied|not authorized/i, "No tenés permisos para realizar esta acción."],
  [/jwt expired|invalid jwt|invalid token/i, "Tu sesión venció. Iniciá sesión nuevamente."],
  [/network error|failed to fetch|fetch failed|load failed/i, connectionMessage],
  [/invalid path specified in request url/i, "No pudimos conectar con Supabase. Revisá la configuración del ambiente."],
  [/duplicate key|already exists/i, "Ya existe un registro con esos datos."],
  [/violates row-level security|row level security/i, "No tenés permisos para guardar esos datos."],
  [/foreign key constraint/i, "Hay datos relacionados que faltan o no corresponden."],
  [/check constraint/i, "Revisá los datos ingresados antes de continuar."],
  [/required/i, "Completá este dato para continuar."],
  [/something went wrong/i, fallbackMessage],
];

function readMessage(error: unknown) {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }

  return "";
}

function looksTechnical(message: string) {
  return (
    /\b(PGRST|SQLSTATE|JWT|fetch|stack|constraint|violates|relation|schema)\b/i.test(
      message,
    ) ||
    /[{}[\]]/.test(message)
  );
}

export function getFriendlyErrorMessage(
  error: unknown,
  fallback = fallbackMessage,
) {
  const rawMessage = readMessage(error).trim();

  if (!rawMessage) {
    return fallback;
  }

  const mapped = knownErrorMessages.find(([pattern]) =>
    pattern.test(rawMessage),
  );

  if (mapped) {
    return mapped[1];
  }

  if (looksTechnical(rawMessage)) {
    return fallback;
  }

  return rawMessage;
}

export function logFriendlyError(context: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[${context}]`, error);
  }
}

export function mapAuthError(error: unknown) {
  return getFriendlyErrorMessage(
    error,
    "No pudimos completar el acceso. Revisá los datos e intentá nuevamente.",
  );
}

export function mapSupabaseError(error: unknown) {
  return getFriendlyErrorMessage(
    error,
    "No pudimos guardar los cambios. Intentá nuevamente en unos segundos.",
  );
}
