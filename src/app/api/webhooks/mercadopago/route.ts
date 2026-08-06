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

  return (
    payload.id?.toString() ??
    url.searchParams.get("data.id") ??
    url.searchParams.get("id")
  );
}

function getEventType(payload: Record<string, unknown>, url: URL) {
  return (
    payload.type?.toString() ??
    payload.topic?.toString() ??
    url.searchParams.get("topic") ??
    url.searchParams.get("type") ??
    payload.action?.toString() ??
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

function getEnvironmentDiagnostics() {
  return {
    MERCADOPAGO_ACCESS_TOKEN: Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN),
    MERCADOPAGO_WEBHOOK_SECRET: Boolean(process.env.MERCADOPAGO_WEBHOOK_SECRET),
    MP_ACCESS_TOKEN: Boolean(process.env.MP_ACCESS_TOKEN),
    MP_WEBHOOK_SECRET: Boolean(process.env.MP_WEBHOOK_SECRET),
    NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    VERCEL_AUTOMATION_BYPASS_SECRET: Boolean(
      process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    ),
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

function getInitialWebhookHeaders(request: Request) {
  return {
    contentType: request.headers.get("content-type"),
    userAgent: request.headers.get("user-agent"),
  };
}

function parseWebhookBody(rawBody: string) {
  if (!rawBody.trim()) {
    return {
      parseError: null,
      payload: {} as Record<string, unknown>,
    };
  }

  try {
    return {
      parseError: null,
      payload: JSON.parse(rawBody) as Record<string, unknown>,
    };
  } catch (error) {
    return {
      parseError:
        error instanceof Error ? error.message : "No pudimos parsear el body.",
      payload: {} as Record<string, unknown>,
    };
  }
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

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

function verifyMercadoPagoWebhookSignature(
  request: Request,
  url: URL,
  payload: Record<string, unknown>,
): SignatureVerificationResult {
  if (
    process.env.SKIP_WEBHOOK_SIGNATURE_VERIFICATION === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    return { signatureEnabled: false, valid: true };
  }

  const secret = (
    process.env.MERCADOPAGO_WEBHOOK_SECRET ?? process.env.MP_WEBHOOK_SECRET
  )?.trim();

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
    payloadDataId ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");

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
      externalReference: payment.external_reference ?? null,
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

async function logMercadoPagoPreapprovalLookup(resourceId: string) {
  try {
    const providerSubscription = await getMercadoPagoSubscription(resourceId);

    console.info("[mercadopago:webhook] Preapproval lookup complete", {
      externalReference: providerSubscription.external_reference ?? null,
      payerEmail: providerSubscription.payer_email ?? null,
      preapproval_id: providerSubscription.id,
      reason: providerSubscription.reason ?? null,
      status: providerSubscription.status ?? null,
    });
  } catch (error) {
    console.error("[mercadopago:webhook] Preapproval lookup failed", {
      error:
        error instanceof Error
          ? error.message
          : "No pudimos consultar la preapproval.",
      id: resourceId,
    });
  }
}

function parseExternalReference(reference: unknown) {
  if (typeof reference !== "string") {
    return null;
  }

  const parts = reference.split(":");
  const [accountId, planCode] = parts;

  if (!accountId || !planCode || parts.length < 3) {
    return null;
  }

  const hasWorkspaceSegment = parts.length >= 4;
  const workspaceId = hasWorkspaceSegment ? parts[2] : null;
  const subscriptionId = hasWorkspaceSegment ? parts[3] : parts[2];

  if (!subscriptionId) {
    return null;
  }

  return {
    accountId,
    planCode: planCode as CommercialPlan,
    subscriptionId,
    workspaceId:
      workspaceId && workspaceId !== "account" ? workspaceId : null,
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
    .select("id, account_id, workspace_id, plans(code)")
    .eq("provider_subscription_id", params.providerSubscriptionId)
    .maybeSingle();

  if (subscription?.id && subscription.account_id) {
    return {
      accountId: subscription.account_id as string,
      planCode:
        ((subscription as { plans?: { code?: string } }).plans
          ?.code as CommercialPlan) ?? ("INDEPENDIENTE" as CommercialPlan),
      subscriptionId: subscription.id as string,
      workspaceId:
        (subscription as { workspace_id?: string | null }).workspace_id ?? null,
    };
  }

  if (params.reference === "KINEPART" || !params.reference) {
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
        workspaceId: null,
      };
    }
  }

  return null;
}

export async function processMercadoPagoSubscriptionForWebhook(params: {
  admin: SupabaseAdminClient;
  eventId: string;
  providerSubscription: MercadoPagoPreapproval;
}) {
  const { admin, eventId, providerSubscription } = params;

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

    return {
      applied: false,
      reason: "subscription_reference_unresolved",
      providerSubscriptionId: providerSubscription.id,
    };
  }

  const updateResult = await applyMercadoPagoSubscriptionToAccount({
    accountId: parsed.accountId,
    accountType:
      parsed.planCode === "CONSULTORIO" ? "CONSULTORIO" : "KINESIOLOGO",
    admin,
    planCode: parsed.planCode,
    providerSubscription,
    workspaceId: parsed.workspaceId ?? undefined,
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
    workspaceId: parsed.workspaceId ?? null,
    providerStatus: updateResult.providerStatus,
    providerSubscriptionId: providerSubscription.id,
  });

  return {
    accountId: parsed.accountId,
    applied: true,
    internalStatus: updateResult.internalStatus,
    planCode: parsed.planCode,
    preapproval_id: providerSubscription.id,
    profileStatus: updateResult.profileStatus,
    providerStatus: updateResult.providerStatus,
  };
}

export async function POST(request: Request) {
  const timestamp = new Date().toISOString();
  const url = new URL(request.url);
  const rawBody = await request.text();
  const { parseError, payload } = parseWebhookBody(rawBody);
  const logContext = getWebhookLogContext(request, url, payload);

  console.info("[mp:webhook] received", {
    body: parseError ? null : payload,
    headers: getInitialWebhookHeaders(request),
    method: request.method,
    queryParams: getSanitizedQueryParams(url),
    rawBody,
    url: getSanitizedUrl(url),
  });

  console.info("[mercadopago:webhook] Request received", {
    ...logContext,
    environment: getEnvironmentDiagnostics(),
    parsedBody: payload,
    payload: getPayloadLogSummary(payload),
    parseError,
    rawBody,
    timestamp,
  });

  if (parseError) {
    console.warn("[mercadopago:webhook] Body parse failed", {
      ...logContext,
      parseError,
      rawBody,
      timestamp,
    });
  }

  const signatureVerification = verifyMercadoPagoWebhookSignature(
    request,
    url,
    payload,
  );

  if (!signatureVerification.valid) {
    console.warn("[mp:webhook] signature validation failed", {
      ...logContext,
      reason: signatureVerification.reason,
      signatureEnabled: signatureVerification.signatureEnabled,
    });

    console.warn("[mercadopago:webhook] Unauthorized request rejected", {
      ...logContext,
      payload: getPayloadLogSummary(payload),
      reason: signatureVerification.reason,
      signatureEnabled: signatureVerification.signatureEnabled,
    });

    return okResponse(logContext, {
      processingSkipped: true,
      reason: signatureVerification.reason,
      signatureInvalid: true,
    });
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

  if (!resourceId || eventType === "unknown") {
    console.warn("[mp:webhook] missing id/type/action", {
      eventId,
      eventType,
      queryParams: logContext.queryParams,
      resourceId,
    });
  }

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
      console.warn("[mp:webhook] invalid event", {
        eventId,
        eventType,
        reason: "missing_resource_id",
      });
      console.warn("[mercadopago:webhook] Event without resource id", {
        eventId,
        eventType,
        queryParams: logContext.queryParams,
      });
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext);
    }

    if (!isSupportedMercadoPagoEvent(eventType)) {
      console.warn("[mp:webhook] invalid event", {
        eventId,
        eventType,
        reason: "unsupported_event_type",
        resourceId,
      });
      console.info("[mercadopago:webhook] Unsupported event ignored after logging", {
        eventId,
        eventType,
        resourceId,
      });
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventRecord.id);
      return okResponse(logContext, { ignored: eventType });
    }

    if (eventType.includes("preapproval")) {
      await logMercadoPagoPreapprovalLookup(resourceId);
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

    const processingResult = await processMercadoPagoSubscriptionForWebhook({
      admin,
      eventId,
      providerSubscription,
    });

    await admin
      .from("payment_events")
      .update({ processed: true })
      .eq("id", eventRecord.id);

    return okResponse(logContext, { processingResult });
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
