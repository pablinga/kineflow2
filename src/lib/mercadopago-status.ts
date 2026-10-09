/**
 * Estados de suscripción de Mercado Pago: lógica pura (sin dependencias) para
 * que la usen el webhook, el retorno del checkout y el script de
 * reconciliación.
 */

export type SubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED"
  | "PAST_DUE"
  | "EXPIRED";

/** Valores que acepta subscriptions_status_check. */
export const STORED_SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "PENDING_PAYMENT",
  "ACTIVE",
  "PAUSED",
  "CANCELLED",
  "PAST_DUE",
  "EXPIRED",
];

export function mapMercadoPagoStatus(status?: string): SubscriptionStatus {
  if (status === "authorized" || status === "active" || status === "approved") {
    return "ACTIVE";
  }

  if (status === "paused") {
    return "PAUSED";
  }

  if (status === "canceled" || status === "cancelled") {
    return "CANCELLED";
  }

  if (status === "expired") {
    return "EXPIRED";
  }

  if (status === "pending") {
    return "PENDING_PAYMENT";
  }

  return "PAST_DUE";
}

export function mapSubscriptionStatusToProfileStatus(
  status: SubscriptionStatus,
) {
  if (status === "ACTIVE") {
    return "ACTIVO";
  }

  if (status === "CANCELLED") {
    return "CANCELADO";
  }

  if (status === "PAUSED" || status === "PAST_DUE" || status === "EXPIRED") {
    return "VENCIDO";
  }

  return "PENDIENTE";
}

export type PreapprovalStatusSource = {
  id: string;
  next_payment_date?: string | null;
  status?: string;
};

export type ExistingSubscriptionState = {
  activated_at: string | null;
  canceled_at: string | null;
  current_period_start: string | null;
  status: string;
} | null;

/**
 * Columnas de subscriptions que cambian con el estado de la preapproval. El
 * estado se guarda tal cual (antes todo lo que no era ACTIVE ni CANCELLED se
 * guardaba como "FREE", que la constraint rechaza). Las fechas de activación y
 * baja se conservan si el estado no cambió.
 */
export function buildSubscriptionStatusUpdate(
  preapproval: PreapprovalStatusSource,
  existing: ExistingSubscriptionState,
  now: string,
) {
  const status = mapMercadoPagoStatus(preapproval.status);
  const wasActive = existing?.status === "ACTIVE";
  const wasCancelled = existing?.status === "CANCELLED";

  return {
    activated_at:
      status === "ACTIVE"
        ? wasActive && existing?.activated_at
          ? existing.activated_at
          : now
        : existing?.activated_at ?? null,
    canceled_at:
      status === "CANCELLED" ? (wasCancelled && existing?.canceled_at) || now : null,
    current_period_end: preapproval.next_payment_date ?? null,
    current_period_start:
      status === "ACTIVE"
        ? wasActive && existing?.current_period_start
          ? existing.current_period_start
          : now
        : null,
    provider_status: preapproval.status ?? null,
    provider_subscription_id: preapproval.id,
    status,
  };
}
