import { plans, type CommercialPlan } from "@/lib/plans";

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

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

export function getSiteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export function isPaidPlan(plan: CommercialPlan) {
  return plan !== "FREE";
}

export function isConsultorioPlan(plan: CommercialPlan) {
  return plan.startsWith("CONSULTORIO_");
}

export function getCheckoutPlan(planId: CommercialPlan) {
  return plans.find((plan) => plan.id === planId && isPaidPlan(plan.id));
}

export function mapMercadoPagoStatus(status?: string): SubscriptionStatus {
  if (status === "authorized") {
    return "ACTIVE";
  }

  if (status === "paused") {
    return "PAUSED";
  }

  if (status === "cancelled") {
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

export async function createMercadoPagoPreapproval(params: {
  planId: CommercialPlan;
  userId: string;
  userEmail: string;
  subscriptionId: string;
}): Promise<MercadoPagoPreapproval> {
  const accessToken = getMercadoPagoAccessToken();
  const siteUrl = getSiteUrl();
  const plan = getCheckoutPlan(params.planId);

  if (!plan || !plan.priceAmount) {
    throw new Error("El plan seleccionado no requiere checkout.");
  }

  if (!accessToken) {
    throw new Error("Mercado Pago no está configurado.");
  }

  const response = await fetch(`${MERCADOPAGO_API_URL}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: `KineFlow ${plan.name}`,
      external_reference: `${params.userId}:${params.planId}:${params.subscriptionId}`,
      payer_email: params.userEmail,
      back_url: `${siteUrl}/billing/success`,
      notification_url: `${siteUrl}/api/webhooks/mercadopago`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plan.priceAmount,
        currency_id: "ARS",
      },
      status: "pending",
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ?? "Mercado Pago no pudo crear la suscripción.",
    );
  }

  return data;
}

export async function getMercadoPagoSubscription(subscriptionId: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no está configurado.");
  }

  const response = await fetch(
    `${MERCADOPAGO_API_URL}/preapproval/${subscriptionId}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos leer la suscripción.");
  }

  return data as MercadoPagoPreapproval;
}

export async function cancelMercadoPagoSubscription(subscriptionId: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no está configurado.");
  }

  const response = await fetch(
    `${MERCADOPAGO_API_URL}/preapproval/${subscriptionId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos cancelar la suscripción.");
  }

  return data as MercadoPagoPreapproval;
}
