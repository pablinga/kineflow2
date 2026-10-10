// Checklist de activación del Inicio (cuenta nueva). Lógica pura, sin red:
// el estado de cada paso sale de datos reales (ver useActivationChecklist).

export type ActivationStepId =
  | "account"
  | "patients"
  | "availability"
  | "booking_link";

export type ActivationFacts = {
  /** Pacientes del espacio activo (cualquier estado). */
  patientCount: number;
  /** Hay al menos un horario de atención activo. */
  hasAvailability: boolean;
  /** profiles.booking_link_shared_at: tocó "Copiar link" o "Compartir". */
  bookingLinkSharedAt: string | null;
  /** Turnos con booking_source public_link / public_qr. */
  onlineBookingCount: number;
};

export type ActivationStep = {
  id: ActivationStepId;
  done: boolean;
};

export type ActivationChecklistMode = "full" | "compact" | "hidden";

export const ACTIVATION_STEP_ORDER: ActivationStepId[] = [
  "account",
  "patients",
  "availability",
  "booking_link",
];

export function getActivationSteps(facts: ActivationFacts): ActivationStep[] {
  const doneById: Record<ActivationStepId, boolean> = {
    // El paso 1 siempre está completo: si ve el Inicio, la cuenta existe.
    account: true,
    patients: facts.patientCount > 0,
    availability: facts.hasAvailability,
    booking_link:
      Boolean(facts.bookingLinkSharedAt) || facts.onlineBookingCount > 0,
  };

  return ACTIVATION_STEP_ORDER.map((id) => ({ done: doneById[id], id }));
}

export function getActivationProgress(steps: ActivationStep[]) {
  const total = steps.length;
  const completed = steps.filter((step) => step.done).length;
  const percent = total === 0 ? 100 : Math.round((completed / total) * 100);

  return { completed, percent, total };
}

export function getFirstPendingStepId(
  steps: ActivationStep[],
): ActivationStepId | null {
  return steps.find((step) => !step.done)?.id ?? null;
}

/**
 * Qué versión del checklist mostrar en el Inicio.
 * - Solo el kinesiólogo en su espacio particular y el admin de una clínica
 *   (recepción y los profesionales del equipo no arman el consultorio).
 * - "full": la cuenta todavía no tiene ningún turno asistido; el checklist
 *   reemplaza al dashboard.
 * - "compact": ya hay actividad pero falta algún paso; tarjeta arriba del
 *   dashboard, para no esconderle sus datos a un usuario activo.
 */
export function getActivationChecklistMode(params: {
  accountType: "KINESIOLOGO" | "CONSULTORIO" | "RECEPCION";
  workspaceType: "PERSONAL" | "CLINICA" | null;
  workspaceRole: "ADMIN" | "KINESIOLOGO" | "RECEPCION" | null;
  steps: ActivationStep[];
  dismissedAt: string | null;
  hasAttendedAppointment: boolean;
}): ActivationChecklistMode {
  const isEligible =
    (params.accountType === "KINESIOLOGO" &&
      params.workspaceType === "PERSONAL") ||
    (params.accountType === "CONSULTORIO" &&
      params.workspaceType === "CLINICA" &&
      params.workspaceRole === "ADMIN");

  if (!isEligible || params.dismissedAt) {
    return "hidden";
  }

  if (params.steps.every((step) => step.done)) {
    return "hidden";
  }

  return params.hasAttendedAppointment ? "compact" : "full";
}

/** "¡Hola, Ana!" — no hay dato de género, así que el saludo es neutro. */
export function getActivationGreeting(displayName: string) {
  const firstName = displayName.trim().split(/\s+/)[0] ?? "";

  return firstName ? `¡Hola, ${firstName}!` : "¡Hola!";
}

/** Link de wa.me de soporte, o null si no hay número configurado. */
export function getSupportWhatsAppUrl(
  rawNumber: string | undefined,
  message: string,
) {
  const digits = (rawNumber ?? "").replace(/\D/g, "");

  if (digits.length < 8) {
    return null;
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function getPublicBookingLink(
  workspaceId: string,
  appUrl: string | undefined,
) {
  const base = (appUrl?.trim() || "https://kineflow.ar").replace(/\/$/, "");

  return `${base}/reservar/${workspaceId}`;
}
