/**
 * Pedido de eliminación de cuenta desde la app (lo exige Google Play).
 * La baja no es automática: llega un mail a KineFlow, que la procesa a mano
 * (ver /eliminar-cuenta) y le confirma al usuario por correo.
 */

export const ACCOUNT_DELETION_REASON_MAX = 500;

export function getAccountDeletionInbox() {
  return process.env.ACCOUNT_DELETION_EMAIL?.trim() || "contacto@kineflow.ar";
}

export type AccountDeletionRequest = {
  accountType: string;
  email: string;
  fullName: string;
  /** Espacios de los que es dueño (nombre y tipo). */
  ownedWorkspaces: Array<{ name: string; type: string }>;
  reason: string;
  requestedAt: string;
  subscriptionStatus: string;
  userId: string;
};

/** Normaliza el motivo opcional: sin espacios de más y con largo máximo. */
export function normalizeDeletionReason(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, ACCOUNT_DELETION_REASON_MAX);
}

/** Texto del mail interno con lo necesario para procesar la baja. */
export function buildDeletionRequestText(request: AccountDeletionRequest) {
  const workspaces = request.ownedWorkspaces.length
    ? request.ownedWorkspaces.map((workspace) => `- ${workspace.name} (${workspace.type})`).join("\n")
    : "- (ninguno)";

  return [
    "Pedido de eliminación de cuenta desde la app.",
    "",
    `Usuario: ${request.fullName || "(sin nombre)"}`,
    `Email: ${request.email}`,
    `ID: ${request.userId}`,
    `Tipo de cuenta: ${request.accountType || "(sin dato)"}`,
    `Suscripción: ${request.subscriptionStatus || "sin suscripción"}`,
    `Fecha: ${request.requestedAt}`,
    "",
    "Espacios de los que es dueño:",
    workspaces,
    "",
    `Motivo: ${request.reason || "(no indicó)"}`,
    "",
    "Antes de borrar: confirmar la identidad respondiendo a este email, cancelar la suscripción si sigue activa y seguir el orden de limpieza (turnos → pacientes → clinic_professionals → workspaces → clínicas → usuario).",
  ].join("\n");
}

/** Texto del mail de confirmación al usuario. */
export function buildDeletionConfirmationText(params: { fullName: string; inbox: string }) {
  return [
    `Hola ${params.fullName || ""}`.trim() + ",",
    "",
    "Recibimos tu pedido para eliminar tu cuenta de KineFlow.",
    "",
    "Te vamos a escribir a este correo para confirmar que sos el titular antes de borrar la cuenta y sus datos. Hasta entonces tu cuenta sigue funcionando.",
    "",
    "Si tenés una suscripción activa, cancelala desde Plan / Suscripción para que no se generen nuevos cobros.",
    "",
    `Si no pediste esto, respondé este correo o escribinos a ${params.inbox}.`,
    "",
    "KineFlow",
  ].join("\n");
}
