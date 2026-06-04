import { NextResponse } from "next/server";
import crypto from "crypto";
import { applyMercadoPagoSubscriptionToAccount } from "@/lib/billing-server";
import {
  findMercadoPagoAuthorizedPaymentByPaymentId,
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoSubscription,
  type MercadoPagoPreapproval,
} from "@/lib/mercadopago";
import type { CommercialPlan } from "@/lib/plans";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

function getEventId(payload: Record<string, unknown>, url: URL) {
  if (payload.id) {
    return payload.id.toString();
  }

  if (payload.data && typeof payload.data === "object" && "id" in payload.data) {
    return `${getEventType(payload, url)}:${getEventAction(payload)}:${String(
      (payload.data as { id?: unknown }).id,
    )}`;
  }

  return url.searchParams.get("id") ?? crypto.randomUUID();
}

function getResourceId(payload: Record<string, unknown>, url: URL) {
  if (payload.data && typeof payload.data === "object" && "id" in payload.data) {
    return String((payload.data as { id?: unknown }).id);
  }

  return payload.id?.toString() ?? url.searchParams.get("id");
}

function getEventType(payload: Record<string, unknown>, url: URL) {
  return (
    payload.type?.toString() ??
    payload.action?.toString() ??
    url.searchParams.get("topic") ??
    url.searchParams.get("type") ??
    "unknown"
  );
}

function getEventAction(payload: Record<string, unknown>) {
  return payload.action?.toString() ?? "unknown";
}

function isSupportedMercadoPagoEvent(eventType: string) {
  return (
    eventType.includes("preapproval") ||
    eventType.includes("authorized_payment") ||
    eventType.includes("payment")
  );
}

function getSignaturePart(signature: string, key: string) {
  return signature
    .split(",")
    .map((part) => part.trim().split("="))
    .find(([partKey]) => partKey === key)?.[1];
}

function signaturesMatch(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

function isMercadoPagoDashboardTestEvent(payload: Record<string, unknown>) {
  const dataId =
    payload.data && typeof payload.data === "object" && "id" in payload.data
      ? String((payload.data as { id?: unknown }).id)
      : null;

  return (
    payload.id?.toString() === "123456" &&
    dataId === "123456" &&
    payload.type?.toString() === "subscription_preapproval"
  );
}

function isMercadoPagoDashboardTestRequest(
  payload: Record<string, unknown>,
  url: URL,
) {
  if (isMercadoPagoDashboardTestEvent(payload)) {
    return true;
  }

  const dataId =
    url.searchParams.get("data.id") ??
    url.searchParams.get("id") ??
    (payload.data && typeof payload.data === "object" && "id" in payload.data
      ? String((payload.data as { id?: unknown }).id)
      : null);

  return dataId === "123456";
}

function getRelevantWebhookHeaders(request: Request) {
  const signature = request.headers.get("x-signature");
  const authorization = request.headers.get("authorization");

  return {
    authorization: authorization ? "present" : null,
    contentType: request.headers.get("content-type"),
    origin: request.headers.get("origin"),
    signature: signature ? "present" : null,
    userAgent: request.headers.get("user-agent"),
    xRequestId: request.headers.get("x-request-id"),
  };
}

function getPayloadDataId(payload: Record<string, unknown>) {
  return payload.data && typeof payload.data === "object" && "id" in payload.data
    ? String((payload.data as { id?: unknown }).id)
    : null;
}

function getSanitizedQueryParams(url: URL) {
  return Object.fromEntries(
    Array.from(url.searchParams.entries()).map(([key, value]) => [
      key,
      key.toLowerCase() === "x-vercel-protection-bypass" ? "[redacted]" : value,
    ]),
  );
}

function getSanitizedUrl(url: URL) {
  const sanitized = new URL(url.toString());

  if (sanitized.searchParams.has("x-vercel-protection-bypass")) {
    sanitized.searchParams.set("x-vercel-protection-bypass", "[redacted]");
  }

  return sanitized.toString();
}

function getWebhookLogContext(
  request: Request,
  url: URL,
  payload: Record<string, unknown>,
) {
  const dataId =
    getPayloadDataId(payload) ??
    url.searchParams.get("data.id") ??
    url.searchParams.get("id");

  return {
    action: getEventAction(payload),
    dataId,
    eventType: getEventType(payload, url),
    headers: getRelevantWebhookHeaders(request),
    method: request.method,
    queryParams: getSanitizedQueryParams(url),
    url: getSanitizedUrl(url),
  };
}

function getPayloadLogSummary(payload: Record<string, unknown>) {
  return {
    action: getEventAction(payload),
    dataId: getPayloadDataId(payload),
    id: payload.id?.toString() ?? null,
    type: payload.type?.toString() ?? null,
  };
}

function okResponse(
  context: ReturnType<typeof getWebhookLogContext>,
  body: Record<string, unknown> = {},
) {
  const responseBody = { ok: true, ...body };

  console.info("[mercadopago:webhook] Response sent", {
    ...context,
    response: responseBody,
    status: 200,
  });

  return NextResponse.json(responseBody, { status: 200 });
}

type SignatureVerificationResult = {
  reason?: string;
  signatureEnabled: boolean;
  valid: boolean;
};

function verifyMercadoPagoWebhookSignature(
  request: Request,
  url: URL,
  payload: Record<string, unknown>,
): SignatureVerificationResult {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return { signatureEnabled: false, valid: true };
  }

  if (isMercadoPagoDashboardTestRequest(payload, url)) {
    return { signatureEnabled: true, valid: true };
  }

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const payloadDataId = getPayloadDataId(payload);
  const dataId =
    url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? payloadDataId;

  if (!signature || !requestId || !dataId) {
    return {
      reason: "missing_signature_headers_or_data_id",
      signatureEnabled: true,
      valid: false,
    };
  }

  const ts = getSignaturePart(signature, "ts");
  const hash = getSignaturePart(signature, "v1");

  if (!ts || !hash) {
    return {
      reason: "malformed_x_signature",
      signatureEnabled: true,
      valid: false,
    };
  }

  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return {
    reason: "signature_hash_mismatch",
    signatureEnabled: true,
    valid: signaturesMatch(expectedHash, hash),
  };
}

async function getProviderSubscriptionFromEvent(params: {
  eventType: string;
  resourceId: string;
}) {
  if (params.eventType.includes("preapproval")) {
    return getMercadoPagoSubscription(params.resourceId);
  }

  if (params.eventType.includes("authorized_payment")) {
    const authorizedPayment = await getMercadoPagoAuthorizedPayment(
      params.resourceId,
    );

    if (!authorizedPayment.preapproval_id) {
      return null;
    }

    return getMercadoPagoSubscription(authorizedPayment.preapproval_id);
  }

  if (params.eventType.includes("payment")) {
    const payment = await getMercadoPagoPayment(params.resourceId);
    const preapprovalId =
      payment.metadata?.preapproval_id ??
      payment.metadata?.preapprovalId ??
      payment.point_of_interaction?.transaction_data?.subscription_id;

    console.info("[mercadopago:webhook] Payment loaded", {
      paymentId: payment.id,
      paymentStatus: payment.status,
      preapprovalId: preapprovalId ?? null,
    });

    if (preapprovalId) {
      return getMercadoPagoSubscription(preapprovalId);
    }

    const authorizedPayment = await findMercadoPagoAuthorizedPaymentByPaymentId(
      params.resourceId,
    );

    console.info("[mercadopago:webhook] Authorized payment lookup complete", {
      authorizedPaymentId: authorizedPayment?.id ?? null,
      paymentId: params.resourceId,
      preapprovalId: authorizedPayment?.preapproval_id ?? null,
      status: authorizedPayment?.status ?? null,
    });

    if (!authorizedPayment?.preapproval_id) {
      return null;
    }

    return getMercadoPagoSubscription(authorizedPayment.preapproval_id);
  }

  return null;
}

function parseExternalReference(reference: unknown) {
  if (typeof reference !== "string") {
    return null;
  }

  const [accountId, planCode, subscriptionId] = reference.split(":");

  if (!accountId || !planCode || !subscriptionId) {
    return null;
  }

  return {
    accountId,
    planCode: planCode as CommercialPlan,
    subscriptionId,
  };
}

async function resolveParsedReference(params: {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  providerSubscriptionId: string;
  providerSubscription: MercadoPagoPreapproval;
  reference: unknown;
}) {
  const parsed = parseExternalReference(params.reference);

  if (parsed) {
    return parsed;
  }

  if (!params.admin) {
    return null;
  }

  const { data: subscription } = await params.admin
    .from("subscriptions")
    .select("id, account_id, plans(code)")
    .eq("provider_subscription_id", params.providerSubscriptionId)
    .maybeSingle();

  if (subscription?.id && subscription.account_id) {
    return {
      accountId: subscription.account_id as string,
      planCode:
        ((subscription as { plans?: { code?: string } }).plans
          ?.code as CommercialPlan) ?? ("INDEPENDIENTE" as CommercialPlan),
      subscriptionId: subscription.id as string,
    };
  }

  const { data: profile } = await params.admin
    .from("profiles")
    .select("id")
    .eq("mercado_pago_preapproval_id", params.providerSubscriptionId)
    .maybeSingle();

  if (profile?.id) {
    return {
      accountId: profile.id as string,
      planCode: "INDEPENDIENTE" as CommercialPlan,
      subscriptionId: null,
    };
  }

  if (params.reference === "KINEINDEP" || !params.reference) {
    const payerEmail = params.providerSubscription.payer_email?.toLowerCase();

    if (!payerEmail) {
      return null;
    }

    const { data: profiles } = await params.admin
      .from("profiles")
      .select("id")
      .eq("email", payerEmail)
      .eq("account_type", "KINESIOLOGO")
      .limit(2);

    if (profiles?.length === 1 && profiles[0]?.id) {
      return {
        accountId: profiles[0].id as string,
        planCode: "INDEPENDIENTE" as CommercialPlan,
        subscriptionId: null,
      };
    }
  }

  return null;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const payload = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const logContext = getWebhookLogContext(request, url, payload);

  console.info("[mercadopago:webhook] Request received", {
    ...logContext,
    payload: getPayloadLogSummary(payload),
  });

  const signatureVerification = verifyMercadoPagoWebhookSignature(
    request,
    url,
    payload,
  );

  if (!signatureVerification.valid) {
    console.warn("[mercadopago:webhook] Unauthorized request rejected", {
      ...logContext,
      payload: getPayloadLogSummary(payload),
      reason: signatureVerification.reason,
      signatureEnabled: signatureVerification.signatureEnabled,
    });

    return NextResponse.json(
      {
        error: "Firma de Mercado Pago invalida.",
        reason: signatureVerification.reason,
      },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return okResponse(logContext, {
      warning: "Falta SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const eventId = getEventId(payload, url);
  const eventType = getEventType(payload, url);
  const resourceId = getResourceId(payload, url);

  console.info("[mercadopago:webhook] Event received", {
    eventId,
    eventType,
    resourceId,
  });

  const { data: eventInsert, error: eventInsertError } = await admin
    .from("payment_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload,
      provider: "mercadopago",
    })
    .select("id")
    .single();

  let eventRecord = eventInsert as { id: string } | null;

  if (eventInsertError || !eventRecord) {
    const { data: existingEvent } = await admin
      .from("payment_events")
      .select("id, processed")
      .eq("provider", "mercadopago")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingEvent?.processed) {
      console.info("[mercadopago:webhook] Duplicate event already processed", {
        eventId,
        eventType,
        resourceId,
      });

      return okResponse(logContext, { duplicate: true });
    }

    if (existingEvent?.id) {
      console.info("[mercadopago:webhook] Retrying previously stored event", {
        eventId,
        eventType,
        resourceId,
      });
      eventRecord = existingEvent as { id: string };
    } else {
      console.error("[mercadopago:webhook] Could not store event", {
        error: eventInsertError?.message ?? "Unknown insert error",
        eventId,
        eventType,
        resourceId,
      });

      return okResponse(logContext, { processingError: true });
    }
  }

  try {
    if (!resourceId) {
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext);
    }

    if (!isSupportedMercadoPagoEvent(eventType)) {
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext, { ignored: eventType });
    }

    const providerSubscription = await getProviderSubscriptionFromEvent({
      eventType,
      resourceId,
    });

    if (!providerSubscription) {
      console.warn("[mercadopago:webhook] Subscription not found for event", {
        eventId,
        eventType,
        resourceId,
      });
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext);
    }

    console.info("[mercadopago:webhook] Subscription loaded", {
      externalReference: providerSubscription.external_reference,
      preapproval_id: providerSubscription.id,
      providerStatus: providerSubscription.status,
      providerSubscriptionId: providerSubscription.id,
    });

    const parsed = await resolveParsedReference({
      admin,
      providerSubscription,
      providerSubscriptionId: providerSubscription.id,
      reference: providerSubscription.external_reference,
    });

    if (!parsed) {
      console.warn("[mercadopago:webhook] Subscription reference unresolved", {
        eventId,
        externalReference: providerSubscription.external_reference,
        providerSubscriptionId: providerSubscription.id,
      });
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext);
    }

    if (parsed.planCode !== "INDEPENDIENTE") {
      console.info("[mercadopago:webhook] Ignored non-MVP plan", {
        accountId: parsed.accountId,
        planCode: parsed.planCode,
        providerSubscriptionId: providerSubscription.id,
      });
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext, {
        ignored: "El MVP1 solo activa KineFlow - Particular.",
      });
    }

    const updateResult = await applyMercadoPagoSubscriptionToAccount({
      accountId: parsed.accountId,
      accountType: "KINESIOLOGO",
      admin,
      planCode: parsed.planCode,
      providerSubscription,
    });

    console.info("[mercadopago:webhook] Supabase subscription update complete", {
      accountId: parsed.accountId,
      action:
        updateResult.internalStatus === "ACTIVE"
          ? "activated_independiente"
          : `set_free_${updateResult.internalStatus.toLowerCase()}`,
      internalStatus: updateResult.internalStatus,
      planCode: parsed.planCode,
      preapproval_id: providerSubscription.id,
      profileStatus: updateResult.profileStatus,
      status_recibido: providerSubscription.status,
      providerStatus: updateResult.providerStatus,
      providerSubscriptionId: providerSubscription.id,
    });

    await admin
      .from("payment_events")
      .update({ processed: true })
      .eq("id", eventRecord.id);

    return okResponse(logContext);
  } catch (error) {
    console.error("[mercadopago:webhook] Processing failed", {
      error:
        error instanceof Error ? error.message : "No pudimos procesar el webhook.",
      eventId,
      eventType,
      resourceId,
    });

    return okResponse(logContext, { processingError: true });
  }
}
