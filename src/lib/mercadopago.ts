import { plans, type CommercialPlan } from "@/lib/plans";

const MERCADOPAGO_API_URL = "https://api.mercadopago.com";

const MERCADOPAGO_PREAPPROVAL_PLAN_IDS: Partial<Record<CommercialPlan, string>> = {
  INDEPENDIENTE: "a7be629d2d77468a94dac3e415d487e4",
};

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

export function getMercadoPagoPublicKey() {
  return process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY;
}

export function isMercadoPagoTestMode(accessToken: string) {
  return accessToken.startsWith("TEST-");
}

function getMercadoPagoTokenMode(accessToken: string) {
  return isMercadoPagoTestMode(accessToken) ? "TEST" : "PROD";
}

function getSafeTokenPrefix(accessToken: string) {
  return accessToken.slice(0, Math.min(accessToken.indexOf("-") + 1 || 4, 8));
}

function getMercadoPagoHeaders(accessToken: string) {
  const mode = getMercadoPagoTokenMode(accessToken);

  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...(mode === "TEST" ? { "X-scope": "stage" } : {}),
  };
}

export function getMercadoPagoPayerEmail(fallbackEmail: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no está configurado.");
  }

  const mode = getMercadoPagoTokenMode(accessToken);
  const testPayerEmail = process.env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim();

  if (mode === "TEST" && !testPayerEmail) {
    throw new Error(
      "Falta configurar MERCADOPAGO_TEST_PAYER_EMAIL para modo prueba",
    );
  }

  return testPayerEmail || fallbackEmail;
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

export function getMercadoPagoPreapprovalPlanId(planId: CommercialPlan) {
  return MERCADOPAGO_PREAPPROVAL_PLAN_IDS[planId] ?? null;
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

export async function createMercadoPagoPreapproval(params: {
  planId: CommercialPlan;
  userId: string;
  userEmail: string;
  subscriptionId: string;
}): Promise<MercadoPagoPreapproval> {
  const accessToken = getMercadoPagoAccessToken();
  const siteUrl = getSiteUrl();
  const plan = getCheckoutPlan(params.planId);
  const payerEmail = getMercadoPagoPayerEmail(params.userEmail);

  if (!plan || !plan.priceAmount) {
    throw new Error("El plan seleccionado no requiere checkout.");
  }

  if (!accessToken) {
    throw new Error("Mercado Pago no está configurado.");
  }

  const mercadoPagoMode = getMercadoPagoTokenMode(accessToken);
  const publicKey = getMercadoPagoPublicKey();
  const preapprovalPlanId = getMercadoPagoPreapprovalPlanId(params.planId);
  const backUrl = `${siteUrl}/billing/success`;
  const notificationUrl = `${siteUrl}/api/webhooks/mercadopago`;
  const testPayerConfigured = Boolean(
    process.env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim(),
  );
  const payerEmailSource =
    payerEmail === params.userEmail ? "authenticated_user" : "env_test_payer";
  const body = {
    reason: `KineFlow ${plan.name}`,
    external_reference: `${params.userId}:${params.planId}:${params.subscriptionId}`,
    payer_email: payerEmail,
    back_url: backUrl,
    notification_url: notificationUrl,
    ...(preapprovalPlanId
      ? { preapproval_plan_id: preapprovalPlanId }
      : {
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: plan.priceAmount,
            currency_id: "ARS",
          },
        }),
    status: "pending",
  };

  console.info("Mercado Pago preapproval request", {
    backUrl,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    mode: mercadoPagoMode,
    payerEmail,
    payerEmailSource,
    planId: params.planId,
    preapprovalPlanId,
    publicKeyConfigured: Boolean(publicKey),
    publicKeyStartsWithTest: publicKey?.startsWith("TEST-") ?? false,
    safeTokenPrefix: getSafeTokenPrefix(accessToken),
    testPayerConfigured,
    tokenStartsWithTest: isMercadoPagoTestMode(accessToken),
  });

  const response = await fetch(`${MERCADOPAGO_API_URL}/preapproval`, {
    method: "POST",
    headers: getMercadoPagoHeaders(accessToken),
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    const safeBody = {
      blocked_by: data?.blocked_by,
      code: data?.code,
      error: data?.error,
      message: data?.message,
      status: data?.status,
    };

    console.error("Mercado Pago preapproval error", {
      body: safeBody,
      backUrl,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      mode: mercadoPagoMode,
      payerEmail,
      payerEmailSource,
      planId: params.planId,
      preapprovalPlanId,
      publicKeyConfigured: Boolean(publicKey),
      publicKeyStartsWithTest: publicKey?.startsWith("TEST-") ?? false,
      safeTokenPrefix: getSafeTokenPrefix(accessToken),
      status: response.status,
      testPayerConfigured,
      tokenStartsWithTest: isMercadoPagoTestMode(accessToken),
    });

    const detail =
      data?.message ??
      data?.error ??
      data?.cause?.[0]?.description ??
      data?.cause?.[0]?.code ??
      "Mercado Pago no pudo crear la suscripción.";

    throw new Error(
      `${detail} (${response.status}). Modo=${mercadoPagoMode}. PayerSource=${payerEmailSource}. Revisá las credenciales y el comprador de prueba.`,
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
      headers: getMercadoPagoHeaders(accessToken),
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
      headers: getMercadoPagoHeaders(accessToken),
      body: JSON.stringify({ status: "canceled" }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos cancelar la suscripción.");
  }

  return data as MercadoPagoPreapproval;
}
