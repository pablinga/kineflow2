// Señas de la reserva online: reglas puras (sin dependencias) que usan la
// configuración, la reserva, el webhook y las cancelaciones.
// Decisiones (2026-10-28): solo kinesiólogos particulares, solo turnos
// PARTICULAR (no obra social / ART), la seña es a cuenta de la sesión y
// KineFlow no cobra comisión.

export type DepositType = "fixed" | "percent";

export type DepositSettings = {
  cancellation_window_hours: number;
  deposit_enabled: boolean;
  deposit_type: DepositType;
  deposit_value: number;
  payment_window_minutes: number;
};

export type DepositStatus =
  | "awaiting"
  | "paid"
  | "rejected"
  | "expired"
  | "refunded"
  | "retained"
  | "refund_failed";

export const DEFAULT_DEPOSIT_SETTINGS: DepositSettings = {
  cancellation_window_hours: 24,
  deposit_enabled: false,
  deposit_type: "fixed",
  deposit_value: 0,
  payment_window_minutes: 30,
};

export const DEPOSIT_LIMITS = {
  maxCancellationHours: 168,
  maxPaymentWindowMinutes: 1440,
  minPaymentWindowMinutes: 10,
} as const;

/** Monto de la seña en pesos enteros, o null si el turno no lleva seña. */
export function computeDepositAmount(params: {
  paymentType: "PARTICULAR" | "OBRA_SOCIAL" | "ART";
  sessionAmount: number;
  settings: DepositSettings | null;
}) {
  const { settings } = params;

  if (!settings?.deposit_enabled || params.paymentType !== "PARTICULAR") {
    return null;
  }

  const value = Number(settings.deposit_value);
  const sessionAmount = Number(params.sessionAmount) || 0;

  if (!(value > 0)) {
    return null;
  }

  if (settings.deposit_type === "percent") {
    const amount = Math.round((sessionAmount * Math.min(value, 100)) / 100);
    return amount > 0 ? amount : null;
  }

  // Fija: nunca más que el valor de la sesión (si hay precio cargado).
  const amount = Math.round(sessionAmount > 0 ? Math.min(value, sessionAmount) : value);
  return amount > 0 ? amount : null;
}

export function depositExpiresAt(settings: DepositSettings, now = Date.now()) {
  return new Date(now + settings.payment_window_minutes * 60 * 1000).toISOString();
}

/** Errores de validación del formulario de Configuración (vacío = válido). */
export function validateDepositSettings(settings: DepositSettings) {
  const errors: string[] = [];
  const value = Number(settings.deposit_value);

  if (settings.deposit_enabled && !(value > 0)) {
    errors.push("Ingresá el valor de la seña.");
  }

  if (settings.deposit_type === "percent" && value > 100) {
    errors.push("El porcentaje no puede ser mayor a 100.");
  }

  if (
    !Number.isInteger(settings.payment_window_minutes) ||
    settings.payment_window_minutes < DEPOSIT_LIMITS.minPaymentWindowMinutes ||
    settings.payment_window_minutes > DEPOSIT_LIMITS.maxPaymentWindowMinutes
  ) {
    errors.push("El plazo para pagar tiene que ser de 10 minutos a 24 horas.");
  }

  if (
    !Number.isInteger(settings.cancellation_window_hours) ||
    settings.cancellation_window_hours < 0 ||
    settings.cancellation_window_hours > DEPOSIT_LIMITS.maxCancellationHours
  ) {
    errors.push("La anticipación para cancelar tiene que ser de 0 a 168 horas.");
  }

  return errors;
}

export type CancellationDecision = "refund" | "retain" | "none";

/**
 * Qué pasa con la seña al cancelar: si cancela el profesional se devuelve
 * siempre; si cancela el paciente, se devuelve solo con la anticipación
 * configurada; si no había seña cobrada, nada.
 */
export function decideCancellationRefund(params: {
  cancellationWindowHours: number;
  cancelledBy: "patient" | "professional";
  depositStatus: DepositStatus | null;
  now?: number;
  scheduledAt: string;
}): CancellationDecision {
  if (params.depositStatus !== "paid") {
    return "none";
  }

  if (params.cancelledBy === "professional") {
    return "refund";
  }

  const hoursBefore =
    (new Date(params.scheduledAt).getTime() - (params.now ?? Date.now())) / (60 * 60 * 1000);

  return hoursBefore >= params.cancellationWindowHours ? "refund" : "retain";
}

/** Saldo a cobrar en la sesión: la seña pagada y no devuelta se descuenta. */
export function remainingSessionAmount(params: {
  depositAmount: number | null;
  depositStatus: DepositStatus | null;
  sessionAmount: number;
}) {
  const deposit =
    params.depositStatus === "paid" || params.depositStatus === "retained"
      ? Number(params.depositAmount) || 0
      : 0;

  return Math.max(0, (Number(params.sessionAmount) || 0) - deposit);
}

/** Seña que cuenta como ingreso (cobrada y no devuelta). */
export function depositIncome(params: {
  depositAmount: number | null;
  depositStatus: DepositStatus | null;
}) {
  return params.depositStatus === "paid" ||
    params.depositStatus === "retained" ||
    params.depositStatus === "refund_failed"
    ? Number(params.depositAmount) || 0
    : 0;
}

/** Estado de Mercado Pago de un pago → qué hacer con el turno. */
export function depositOutcomeForPaymentStatus(status: string | null | undefined) {
  if (status === "approved") {
    return "paid" as const;
  }

  if (status === "rejected" || status === "cancelled") {
    return "rejected" as const;
  }

  if (status === "refunded" || status === "charged_back") {
    return "refunded" as const;
  }

  // pending, in_process, authorized, in_mediation: se espera otra notificación.
  return "wait" as const;
}

const depositChipLabels: Record<DepositStatus, string> = {
  awaiting: "Seña pendiente",
  expired: "Seña vencida",
  paid: "Seña pagada",
  refund_failed: "Seña sin devolver",
  refunded: "Seña devuelta",
  rejected: "Seña rechazada",
  retained: "Seña retenida",
};

/** Texto del chip de la seña en la agenda ("Seña pagada · $ 5.000"). */
export function getDepositChipLabel(status: DepositStatus, amount: number | null) {
  const label = depositChipLabels[status];
  return amount ? `${label} · $ ${Math.round(amount).toLocaleString("es-AR")}` : label;
}
