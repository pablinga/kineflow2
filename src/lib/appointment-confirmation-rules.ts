/**
 * Reglas puras (sin dependencias) de la confirmación de turno por WhatsApp,
 * compartidas por la reserva online y los turnos que carga el profesional.
 */

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

/** Anticipación mínima para confirmar un turno cargado por el profesional. */
export const CONFIRMATION_MIN_LEAD_MINUTES = 30;

export type ConfirmationSkipReason =
  | "whatsapp_disabled"
  | "no_consent"
  | "no_phone"
  | "not_upcoming"
  | "already_confirmed"
  | "throttled";

export type ConfirmationDecision =
  | { send: true }
  | { reason: ConfirmationSkipReason; send: false };

/**
 * Si corresponde mandar la confirmación. `minLeadMinutes: null` no exige
 * anticipación (reserva online: el horario ya se validó como libre y futuro).
 * Los turnos pasados o históricos que carga el profesional nunca disparan
 * mensajes.
 */
export function decideAppointmentConfirmation(input: {
  alreadyConfirmed: boolean;
  enabled: boolean;
  minLeadMinutes: number | null;
  now: number;
  patient: { phone_e164: string | null; whatsapp_consent: boolean | null };
  scheduledAt: string;
  throttled: boolean;
}): ConfirmationDecision {
  if (!input.enabled) {
    return { reason: "whatsapp_disabled", send: false };
  }

  if (input.patient.whatsapp_consent !== true) {
    return { reason: "no_consent", send: false };
  }

  if (!input.patient.phone_e164) {
    return { reason: "no_phone", send: false };
  }

  if (input.minLeadMinutes !== null) {
    const startsAt = new Date(input.scheduledAt).getTime();

    if (
      !Number.isFinite(startsAt) ||
      startsAt - input.now < input.minLeadMinutes * 60 * 1000
    ) {
      return { reason: "not_upcoming", send: false };
    }
  }

  if (input.alreadyConfirmed) {
    return { reason: "already_confirmed", send: false };
  }

  if (input.throttled) {
    return { reason: "throttled", send: false };
  }

  return { send: true };
}

/** Fecha y hora del turno como las muestra la plantilla confirmacion_turno. */
export function formatAppointmentDateTime(scheduledAt: string) {
  const start = new Date(scheduledAt);

  return {
    date: start.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      timeZone: ARGENTINA_TIME_ZONE,
      weekday: "long",
      year: "numeric",
    }),
    time: start.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: ARGENTINA_TIME_ZONE,
    }),
  };
}
