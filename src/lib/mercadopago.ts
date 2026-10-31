import type { CommercialPlan } from "@/lib/plans";

export {
  mapMercadoPagoStatus,
  mapSubscriptionStatusToProfileStatus,
  type SubscriptionStatus,
} from "@/lib/mercadopago-status";

// La URL de la API se puede cambiar solo fuera de producción (pruebas contra
// un mock local).
export const MERCADOPAGO_API_URL =
  (process.env.NODE_ENV !== "production" && process.env.MERCADOPAGO_API_URL?.trim()) ||
  "https://api.mercadopago.com";
const MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout";

export type MercadoPagoPreapproval = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
  status?: string;
  external_reference?: string;
  payer_id?: number;
  payer_email?: string;
  reason?: string;
  next_payment_date?: string;
  date_created?: string;
  last_modified?: string;
};

export type MercadoPagoAuthorizedPayment = {
  id: number | string;
  external_reference?: string;
  last_modified?: string;
  payment?: {
    id?: number | string;
    status?: string;
    status_detail?: string;
  };
  preapproval_id?: string;
  status?: string;
};

export type MercadoPagoPayment = {
  id: number | string;
  external_reference?: string;
  metadata?: {
    preapproval_id?: string;
    preapprovalId?: string;
  };
  point_of_interaction?: {
    transaction_data?: {
      subscription_id?: string;
    };
  };
  status?: string;
};

export function getMercadoPagoAccessToken() {
  return process.env.MERCADOPAGO_ACCESS_TOKEN ?? process.env.MP_ACCESS_TOKEN;
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
  return plan === "CONSULTORIO";
}

export function getMercadoPagoPreapprovalPlanId(planId: CommercialPlan) {
  if (planId === "INDEPENDIENTE") {
    return process.env.NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID?.trim() || null;
  }

  if (planId === "CONSULTORIO") {
    return (
      process.env.NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID_CONSULTORIO?.trim() ||
      null
    );
  }

  return null;
}

export function getAppUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!appUrl) {
    throw new Error("Falta configurar NEXT_PUBLIC_APP_URL.");
  }

  return appUrl.replace(/\/$/, "");
}

export function getSubscriptionReturnUrls() {
  const appUrl = getAppUrl();

  return {
    failure: `${appUrl}/suscripcion-error`,
    pending: `${appUrl}/suscripcion-pendiente`,
    success: `${appUrl}/suscripcion-exitosa`,
  };
}

export function getMercadoPagoSubscriptionCheckoutUrl(
  planId: CommercialPlan,
  options?: {
    backUrl?: string;
    externalReference?: string;
    payerEmail?: string;
  },
) {
  const preapprovalPlanId = getMercadoPagoPreapprovalPlanId(planId);

  if (!preapprovalPlanId) {
    throw new Error("El plan no tiene checkout de suscripción configurado.");
  }

  const url = new URL(MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL);
  url.searchParams.set("preapproval_plan_id", preapprovalPlanId);

  if (options?.backUrl) {
    url.searchParams.set("back_url", options.backUrl);
  }

  if (options?.externalReference) {
    url.searchParams.set("external_reference", options.externalReference);
  }

  if (options?.payerEmail) {
    url.searchParams.set("payer_email", options.payerEmail);
  }

  return url.toString();
}

export function getMercadoPagoCheckoutInitPoint(initPoint: string) {
  return initPoint;
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
    throw new Error(data?.message ?? "No pudimos leer la suscripción.");
  }

  return data as MercadoPagoPreapproval;
}

export async function getMercadoPagoAuthorizedPayment(authorizedPaymentId: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no esta configurado.");
  }

  const response = await fetch(
    `${MERCADOPAGO_API_URL}/authorized_payments/${authorizedPaymentId}`,
    {
      headers: getMercadoPagoHeaders(accessToken),
    },
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos leer la factura autorizada.");
  }

  return data as MercadoPagoAuthorizedPayment;
}

export async function findMercadoPagoAuthorizedPaymentByPaymentId(
  paymentId: string,
) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no esta configurado.");
  }

  const url = new URL(`${MERCADOPAGO_API_URL}/authorized_payments/search`);
  url.searchParams.set("payment_id", paymentId);

  const response = await fetch(url, {
    headers: getMercadoPagoHeaders(accessToken),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos buscar la factura autorizada.");
  }

  return (data?.results?.[0] ?? null) as MercadoPagoAuthorizedPayment | null;
}

export async function getMercadoPagoPayment(paymentId: string) {
  const accessToken = getMercadoPagoAccessToken();

  if (!accessToken) {
    throw new Error("Mercado Pago no esta configurado.");
  }

  return getMercadoPagoPaymentWithToken(accessToken, paymentId);
}

// --- Señas: llamadas con el token del profesional (OAuth marketplace) ------

export class MercadoPagoApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function mercadoPagoRequest<T>(
  accessToken: string,
  path: string,
  init: { body?: unknown; idempotencyKey?: string; method?: "GET" | "POST" } = {},
) {
  const response = await fetch(`${MERCADOPAGO_API_URL}${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      ...getMercadoPagoHeaders(accessToken),
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    method: init.method ?? "GET",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new MercadoPagoApiError(
      (data as { message?: string })?.message ?? `Mercado Pago respondió ${response.status}.`,
      response.status,
    );
  }

  return data as T;
}

export type MercadoPagoDepositPayment = MercadoPagoPayment & {
  collector_id?: number | string;
  currency_id?: string;
  date_approved?: string | null;
  metadata?: MercadoPagoPayment["metadata"] & { kineflow_kind?: string };
  status_detail?: string;
  transaction_amount?: number;
};

export function getMercadoPagoPaymentWithToken(accessToken: string, paymentId: string) {
  return mercadoPagoRequest<MercadoPagoDepositPayment>(
    accessToken,
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
}

export type MercadoPagoPreferenceInput = {
  amount: number;
  appointmentId: string;
  backUrl: string;
  expiresAt: string;
  notificationUrl: string;
  payerEmail?: string | null;
  payerName?: string | null;
  title: string;
};

/** Preferencia de Checkout Pro a nombre del profesional; external_reference = id del turno. */
export function createMercadoPagoDepositPreference(
  accessToken: string,
  input: MercadoPagoPreferenceInput,
) {
  return mercadoPagoRequest<{ id: string; init_point?: string; sandbox_init_point?: string }>(
    accessToken,
    "/checkout/preferences",
    {
      body: {
        auto_return: "approved",
        back_urls: {
          failure: `${input.backUrl}&r=failure`,
          pending: `${input.backUrl}&r=pending`,
          success: `${input.backUrl}&r=success`,
        },
        binary_mode: true,
        expiration_date_to: input.expiresAt,
        expires: true,
        external_reference: input.appointmentId,
        items: [
          {
            currency_id: "ARS",
            id: input.appointmentId,
            quantity: 1,
            title: input.title,
            unit_price: input.amount,
          },
        ],
        metadata: { kineflow_kind: "deposit" },
        notification_url: input.notificationUrl,
        payer: {
          ...(input.payerEmail ? { email: input.payerEmail } : {}),
          ...(input.payerName ? { name: input.payerName } : {}),
        },
      },
      idempotencyKey: `deposit-preference-${input.appointmentId}`,
      method: "POST",
    },
  );
}

/** Reembolso total del pago (con el token del profesional que cobró). */
export function refundMercadoPagoPayment(accessToken: string, paymentId: string) {
  return mercadoPagoRequest<{ id: number | string; status?: string }>(
    accessToken,
    `/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
    { body: {}, idempotencyKey: `deposit-refund-${paymentId}`, method: "POST" },
  );
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
      body: JSON.stringify({ status: "cancelled" }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message ?? "No pudimos cancelar la suscripción.");
  }

  return data as MercadoPagoPreapproval;
}
