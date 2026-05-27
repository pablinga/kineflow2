import { plans, type CommercialPlan } from "@/lib/plans";

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

export type CheckoutResult =
  | { status: "not_configured"; message: string }
  | { status: "ready"; initPoint: string; subscriptionId?: string };

export function getMercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN;
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export function isPaidPlan(plan: CommercialPlan) {
  return plan === "INDEPENDIENTE" || plan === "CLINICA";
}

export function getCheckoutPlan(planId: CommercialPlan) {
  return plans.find((plan) => plan.id === planId && isPaidPlan(plan.id));
}

export async function createMercadoPagoSubscription(params: {
  planId: CommercialPlan;
  userId: string;
  userEmail: string;
}): Promise<CheckoutResult> {
  const accessToken = getMercadoPagoAccessToken();
  const appUrl = getAppUrl();
  const plan = getCheckoutPlan(params.planId);

  if (!plan || !plan.priceAmount) {
    throw new Error("El plan selecciónado no requiere checkout.");
  }

  if (!accessToken) {
    return {
      status: "not_configured",
      message:
        "Mercado Pago todavía no está configurado. El plan quedo preparado para activárse cuando se carguen las credenciales.",
    };
  }

  const response = await fetch(`${MERCADOPAGO_API_URL}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reason: `KineFlow ${plan.name}`,
      external_reference: `${params.userId}:${params.planId}`,
      payer_email: params.userEmail,
      back_url: `${appUrl}/dashboard/planes`,
      notification_url: `${appUrl}/api/billing/webhook`,
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
      data?.message ?? "Mercado Pago no pudo crear el checkout.",
    );
  }

  return {
    status: "ready",
    initPoint: data.init_point ?? data.sandbox_init_point,
    subscriptionId: data.id,
  };
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
    throw new Error(data?.message ?? "No pudimos leer la suscripcion.");
  }

  return data;
}
