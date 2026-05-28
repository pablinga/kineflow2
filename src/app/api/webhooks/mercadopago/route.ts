import { NextResponse } from "next/server";
import crypto from "crypto";
import {
  getMercadoPagoSubscription,
  mapMercadoPagoStatus,
  mapSubscriptionStatusToProfileStatus,
} from "@/lib/mercadopago";
import { getPlanDefinition, type CommercialPlan } from "@/lib/plans";
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

function verifyMercadoPagoWebhookSignature(request: Request, url: URL) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return true;
  }

  const signature = request.headers.get("x-signature");
  const requestId = request.headers.get("x-request-id");
  const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

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
  reference: unknown;
}) {
  const parsed = parseExternalReference(params.reference);

  if (parsed) {
    return parsed;
  }

  if (params.reference !== "KINEINDEP" || !params.admin) {
    return null;
  }

  const { data: subscription } = await params.admin
    .from("subscriptions")
    .select("id, account_id")
    .eq("provider_subscription_id", params.providerSubscriptionId)
    .maybeSingle();

  if (!subscription?.id || !subscription.account_id) {
    return null;
  }

  return {
    accountId: subscription.account_id as string,
    planCode: "INDEPENDIENTE" as CommercialPlan,
    subscriptionId: subscription.id as string,
  };
}

export async function POST(request: Request) {
  const url = new URL(request.url);

  if (!verifyMercadoPagoWebhookSignature(request, url)) {
    return NextResponse.json(
      { error: "Firma de Mercado Pago invalida." },
      { status: 401 },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { received: true, warning: "Falta SUPABASE_SERVICE_ROLE_KEY." },
      { status: 202 },
    );
  }

  const eventId = getEventId(payload, url);
  const eventType = getEventType(payload, url);

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
    const resourceId = getResourceId(payload, url);

    if (!resourceId) {
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventInsert.id);
      return NextResponse.json({ received: true });
    }

    const providerSubscription = await getMercadoPagoSubscription(resourceId);
    const parsed = await resolveParsedReference({
      admin,
      providerSubscriptionId: providerSubscription.id,
      reference: providerSubscription.external_reference,
    });

    if (!parsed) {
      await admin
        .from("payment_events")
        .update({ processed: true })
        .eq("id", eventInsert.id);
      return NextResponse.json({ received: true });
    }

    const internalStatus = mapMercadoPagoStatus(providerSubscription.status);
    const profileStatus = mapSubscriptionStatusToProfileStatus(internalStatus);
    const planDefinition = getPlanDefinition(parsed.planCode);
    const periodStart = providerSubscription.date_created ?? null;
    const periodEnd = providerSubscription.next_payment_date ?? null;

    await admin
      .from("subscriptions")
      .update({
        current_period_end: periodEnd,
        current_period_start: periodStart,
        provider_status: providerSubscription.status ?? null,
        provider_subscription_id: providerSubscription.id,
        status: internalStatus,
      })
      .eq("id", parsed.subscriptionId);

    await admin
      .from("profiles")
      .update({
        cantidad_kinesiologos: planDefinition.kinesiologistCount,
        estado_plan: profileStatus,
        fecha_fin_plan: periodEnd,
        fecha_inicio_plan: periodStart ?? new Date().toISOString(),
        limite_pacientes:
          planDefinition.patientLimit === null ? -1 : planDefinition.patientLimit,
        mercadopago_customer_id:
          providerSubscription.payer_id?.toString() ??
          providerSubscription.payer_email ??
          null,
        mercadopago_subscription_id: providerSubscription.id,
        plan: parsed.planCode,
      })
      .eq("id", parsed.accountId);

    await admin
      .from("payment_events")
      .update({ processed: true })
      .eq("id", eventInsert.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos procesar el webhook.",
      },
      { status: 500 },
    );
  }
}
