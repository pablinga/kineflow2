import type { CommercialPlan } from "@/lib/plans";

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";
const MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout";

export type SubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED"
  | "PAST_DUE"
  | "EXPIRED";

export type MercadoPagoPreapproval = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
  status?: string;
  external_reference?: string;
  payer_id?: number;
  payer_email?: string;
  next_payment_date?: string;
  date_created?: string;
  last_modified?: string;
};

export function getMercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN;
}

export function isMercadoPagoTestMode(accessToken: string) {
  return accessToken.startsWith("TEST-");
}

function getMercadoPagoTokenMode(accessToken: string) {
  return isMercadoPagoTestMode(accessToken) ? "TEST" : "PROD";
}

function getMercadoPagoHeaders(accessToken: string) {
  const mode = getMercadoPagoTokenMode(accessToken);

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(mode === "TEST" ? { "X-scope": "stage" } : {}),
  };
}

export function isPaidPlan(plan: CommercialPlan) {
  return plan !== "FREE";
}

export function isConsultorioPlan(plan: CommercialPlan) {
  return plan.startsWith("CONSULTORIO_");
}

export function getMercadoPagoPreapprovalPlanId(planId: CommercialPlan) {
  if (planId === "INDEPENDIENTE") {
    return process.env.NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID?.trim() || null;
  }

  return null;
}

export function getMercadoPagoSubscriptionCheckoutUrl(planId: CommercialPlan) {
  const preapprovalPlanId = getMercadoPagoPreapprovalPlanId(planId);

  if (!preapprovalPlanId) {
    throw new Error("El plan no tiene checkout de suscripcion configurado.");
  }

  const url = new URL(MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL);
  url.searchParams.set("preapproval_plan_id", preapprovalPlanId);

  return url.toString();
}

export function mapMercadoPagoStatus(status?: string): SubscriptionStatus {
  if (status === "authorized") {
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

export async function getMercadoPagoSubscription(subscriptionId: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no esta configurado.");
  }

  const response = await fetch(
    `${MERCADOPAGO_API_URL}/preapproval/${subscriptionId}`,
    {
      headers: getMercadoPagoHeaders(accessToken),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos leer la suscripcion.");
  }

  return data as MercadoPagoPreapproval;
}

export async function cancelMercadoPagoSubscription(subscriptionId: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no esta configurado.");
  }

  const response = await fetch(
    `${MERCADOPAGO_API_URL}/preapproval/${subscriptionId}`,
    {
      method: "PUT",
      headers: getMercadoPagoHeaders(accessToken),
      body: JSON.stringify({ status: "canceled" }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos cancelar la suscripcion.");
  }

  return data as MercadoPagoPreapproval;
}
