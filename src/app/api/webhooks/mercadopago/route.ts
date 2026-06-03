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
    return `${getEventType(payload, url)}:${String(
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

function verifyMercadoPagoWebhookSignature(
  request: Request,
  url: URL,
  payload: Record<string, unknown>,
) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return true;
  }

  if (isMercadoPagoDashboardTestEvent(payload)) {
    return true;
  }

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const payloadDataId =
    payload.data && typeof payload.data === "object" && "id" in payload.data
      ? String((payload.data as { id?: unknown }).id)
      : null;
  const dataId =
    url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? payloadDataId;

  if (!signature || !requestId || !dataId) {
    return false;
  }

  const ts = getSignaturePart(signature, "ts");
  const hash = getSignaturePart(signature, "v1");

  if (!ts || !hash) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  return signaturesMatch(expectedHash, hash);
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

    if (preapprovalId) {
      return getMercadoPagoSubscription(preapprovalId);
    }

    const authorizedPayment = await findMercadoPagoAuthorizedPaymentByPaymentId(
      params.resourceId,
    );

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

  if (!verifyMercadoPagoWebhookSignature(request, url, payload)) {
    return NextResponse.json(
      { error: "Firma de Mercado Pago invalida." },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { received: true, warning: "Falta SUPABASE_SERVICE_ROLE_KEY." },
      { status: 202 },
    );
  }

  const eventId = getEventId(payload, url);
  const eventType = getEventType(payload, url);
  const resourceId = getResourceId(payload, url);

  console.info("[mercadopago:webhook] Event received", {
    eventId,
    eventType,
    resourceId,
  });

  const { data: eventInsert } = await admin
    .from("payment_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      payload,
      provider: "mercadopago",
    })
    .select("id")
    .single();

  if (!eventInsert) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (!resourceId) {
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventInsert.id);
      return NextResponse.json({ received: true });
    }

    if (!isSupportedMercadoPagoEvent(eventType)) {
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventInsert.id);
      return NextResponse.json({ received: true, ignored: eventType });
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
        .eq("id", eventInsert.id);
      return NextResponse.json({ received: true });
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
        .eq("id", eventInsert.id);
      return NextResponse.json({ received: true });
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
        .eq("id", eventInsert.id);
      return NextResponse.json({
        received: true,
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
      .eq("id", eventInsert.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[mercadopago:webhook] Processing failed", {
      error:
        error instanceof Error ? error.message : "No pudimos procesar el webhook.",
      eventId,
      eventType,
      resourceId,
    });

    return NextResponse.json({ received: true, processingError: true });
  }
}
