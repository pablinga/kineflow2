import crypto from "crypto";
import { NextResponse } from "next/server";
import { applyMercadoPagoSubscriptionToAccount } from "@/lib/billing-server";
import {
  findMercadoPagoAuthorizedPaymentByPaymentId,
  getMercadoPagoAuthorizedPayment,
  getMercadoPagoPayment,
  getMercadoPagoSubscription,
  type MercadoPagoPreapproval,
} from "@/lib/mercadopago";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago-signature";
import type { CommercialPlan } from "@/lib/plans";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * Webhook de Mercado Pago. Ruta oficial: /api/mercadopago/webhook (la
 * configurada en el panel). /api/webhooks/mercadopago y /api/billing/webhook
 * usan el mismo handler y se registran con su nombre para ver si les llega
 * algo antes de borrarlas.
 *
 * Respuestas: 401 con firma inválida y 500 si falla el procesamiento, para que
 * Mercado Pago reintente; 200 en el resto. Cada evento queda en payment_events
 * con su estado. Los logs no llevan datos personales (ni email ni body).
 */

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
type Payload = Record<string, unknown>;
type EventStatus = "processed" | "ignored" | "unresolved" | "failed" | "rejected";

/** Referencias fijas que Mercado Pago pone en las preapprovals de los planes. */
const PLAN_EXTERNAL_REFERENCES: Record<string, CommercialPlan> = {
  KINECONSU: "CONSULTORIO",
  KINEINDEP: "INDEPENDIENTE",
  KINEPART: "INDEPENDIENTE",
};

/** Tope de rechazos guardados por hora: el endpoint es público. */
const MAX_REJECTED_EVENTS_PER_HOUR = 100;

function getPayloadDataId(payload: Payload) {
  return payload.data && typeof payload.data === "object" && "id" in payload.data
    ? String((payload.data as { id?: unknown }).id)
    : null;
}

function getEventType(payload: Payload, url: URL) {
  return (
    payload.type?.toString() ??
    payload.topic?.toString() ??
    url.searchParams.get("topic") ??
    url.searchParams.get("type") ??
    payload.action?.toString() ??
    "unknown"
  );
}

function getEventAction(payload: Payload) {
  return payload.action?.toString() ?? "unknown";
}

/** data.id del query string (el que firma Mercado Pago); si no, el del body. */
function getSignedDataId(payload: Payload, url: URL) {
  return url.searchParams.get("data.id") ?? getPayloadDataId(payload) ?? url.searchParams.get("id");
}

function getResourceId(payload: Payload, url: URL) {
  return getSignedDataId(payload, url) ?? payload.id?.toString() ?? null;
}

function getEventId(payload: Payload, url: URL, resourceId: string | null) {
  if (payload.id) {
    return payload.id.toString();
  }

  if (resourceId) {
    return `${getEventType(payload, url)}:${getEventAction(payload)}:${resourceId}`;
  }

  return crypto.randomUUID();
}

function isSupportedEventType(eventType: string) {
  return (
    eventType.includes("preapproval") ||
    eventType.includes("authorized_payment") ||
    eventType.includes("payment")
  );
}

/** "Simular notificación" del panel de Mercado Pago: id y data.id 123456. */
function isDashboardTestEvent(payload: Payload, url: URL) {
  const queryDataId = url.searchParams.get("data.id");

  return (
    payload.id?.toString() === "123456" &&
    getPayloadDataId(payload) === "123456" &&
    (queryDataId === null || queryDataId === "123456")
  );
}

function parseBody(rawBody: string): { payload: Payload; parseError: boolean } {
  if (!rawBody.trim()) {
    return { parseError: false, payload: {} };
  }

  try {
    const parsed = JSON.parse(rawBody) as unknown;
    return parsed && typeof parsed === "object"
      ? { parseError: false, payload: parsed as Payload }
      : { parseError: true, payload: {} };
  } catch {
    return { parseError: true, payload: {} };
  }
}

function errorMessage(error: unknown, fallback: string) {
  return (error instanceof Error ? error.message : fallback).slice(0, 500);
}

async function getProviderSubscriptionFromEvent(eventType: string, resourceId: string) {
  if (eventType.includes("preapproval")) {
    return getMercadoPagoSubscription(resourceId);
  }

  if (eventType.includes("authorized_payment")) {
    const authorizedPayment = await getMercadoPagoAuthorizedPayment(resourceId);
    return authorizedPayment.preapproval_id
      ? getMercadoPagoSubscription(authorizedPayment.preapproval_id)
      : null;
  }

  const payment = await getMercadoPagoPayment(resourceId);
  const preapprovalId =
    payment.metadata?.preapproval_id ??
    payment.metadata?.preapprovalId ??
    payment.point_of_interaction?.transaction_data?.subscription_id;

  if (preapprovalId) {
    return getMercadoPagoSubscription(preapprovalId);
  }

  const authorizedPayment = await findMercadoPagoAuthorizedPaymentByPaymentId(resourceId);
  return authorizedPayment?.preapproval_id
    ? getMercadoPagoSubscription(authorizedPayment.preapproval_id)
    : null;
}

type SubscriptionRow = {
  account_id: string;
  account_type: "KINESIOLOGO" | "CONSULTORIO";
  id: string;
  plans: { code?: string } | Array<{ code?: string }> | null;
  workspace_id: string | null;
};

const SUBSCRIPTION_ROW_COLUMNS = "id, account_id, account_type, workspace_id, plans(code)";

export type SubscriptionTarget = {
  accountId: string;
  accountType: "KINESIOLOGO" | "CONSULTORIO";
  matchedBy: "provider_subscription_id" | "external_reference" | "parsed_reference" | "payer_email";
  planCode: CommercialPlan;
  subscriptionId: string | null;
  workspaceId: string | null;
};

function getRowPlanCode(row: SubscriptionRow, fallback: CommercialPlan): CommercialPlan {
  const plans = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  const code = plans?.code;

  if (code === "INDEPENDIENTE" || code === "CONSULTORIO") {
    return code;
  }

  return fallback;
}

function rowToTarget(row: SubscriptionRow, matchedBy: SubscriptionTarget["matchedBy"]) {
  return {
    accountId: row.account_id,
    accountType: row.account_type,
    matchedBy,
    planCode: getRowPlanCode(
      row,
      row.account_type === "CONSULTORIO" ? "CONSULTORIO" : "INDEPENDIENTE",
    ),
    subscriptionId: row.id,
    workspaceId: row.workspace_id,
  } satisfies SubscriptionTarget;
}

/** Referencia que arma create-subscription: cuenta:plan:workspace|account:uuid. */
function parseExternalReference(reference: string) {
  const [accountId, planCode, workspaceSegment] = reference.split(":");

  if (
    !accountId ||
    !/^[0-9a-f-]{36}$/i.test(accountId) ||
    (planCode !== "INDEPENDIENTE" && planCode !== "CONSULTORIO")
  ) {
    return null;
  }

  return {
    accountId,
    planCode: planCode as CommercialPlan,
    workspaceId:
      workspaceSegment && workspaceSegment !== "account" ? workspaceSegment : null,
  };
}

/**
 * Fila de subscriptions a la que corresponde una preapproval, en orden de
 * confianza: el id de Mercado Pago ya asociado, la external_reference guardada
 * al crear el checkout, la referencia parseada (filas anteriores a guardarla)
 * y, si Mercado Pago devolvió la referencia fija del plan, el email del
 * pagador contra la última fila PENDING_PAYMENT de esa cuenta.
 */
export async function resolveSubscriptionTarget(
  admin: SupabaseAdminClient,
  providerSubscription: MercadoPagoPreapproval,
): Promise<SubscriptionTarget | null> {
  const { data: linked } = await admin
    .from("subscriptions")
    .select(SUBSCRIPTION_ROW_COLUMNS)
    .eq("provider", "mercadopago")
    .eq("provider_subscription_id", providerSubscription.id)
    .maybeSingle();

  if (linked) {
    return rowToTarget(linked as SubscriptionRow, "provider_subscription_id");
  }

  const reference = providerSubscription.external_reference?.trim() ?? "";

  if (reference) {
    const { data: byReference } = await admin
      .from("subscriptions")
      .select(SUBSCRIPTION_ROW_COLUMNS)
      .eq("external_reference", reference)
      .maybeSingle();

    if (byReference) {
      return rowToTarget(byReference as SubscriptionRow, "external_reference");
    }

    const parsed = parseExternalReference(reference);

    if (parsed) {
      let rowQuery = admin
        .from("subscriptions")
        .select(SUBSCRIPTION_ROW_COLUMNS)
        .eq("account_id", parsed.accountId);
      rowQuery = parsed.workspaceId
        ? rowQuery.eq("workspace_id", parsed.workspaceId)
        : rowQuery.is("workspace_id", null);
      const { data: row } = await rowQuery.maybeSingle();

      return row
        ? rowToTarget(row as SubscriptionRow, "parsed_reference")
        : {
            accountId: parsed.accountId,
            accountType: parsed.planCode === "CONSULTORIO" ? "CONSULTORIO" : "KINESIOLOGO",
            matchedBy: "parsed_reference",
            planCode: parsed.planCode,
            subscriptionId: null,
            workspaceId: parsed.workspaceId,
          };
    }
  }

  const planFromReference = reference ? PLAN_EXTERNAL_REFERENCES[reference.toUpperCase()] : undefined;
  const payerEmail = providerSubscription.payer_email?.trim().toLowerCase();

  if ((reference && !planFromReference) || !payerEmail) {
    return null;
  }

  const accountType = planFromReference === "CONSULTORIO" ? "CONSULTORIO" : "KINESIOLOGO";
  const { data: profiles } = await admin
    .from("profiles")
    .select("id")
    .eq("email", payerEmail)
    .eq("account_type", accountType)
    .limit(2);

  if (profiles?.length !== 1) {
    return null;
  }

  const { data: pending } = await admin
    .from("subscriptions")
    .select(SUBSCRIPTION_ROW_COLUMNS)
    .eq("account_id", (profiles[0] as { id: string }).id)
    .eq("status", "PENDING_PAYMENT")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return pending ? rowToTarget(pending as SubscriptionRow, "payer_email") : null;
}

export async function processMercadoPagoSubscriptionForWebhook(params: {
  admin: SupabaseAdminClient;
  providerSubscription: MercadoPagoPreapproval;
}) {
  const target = await resolveSubscriptionTarget(params.admin, params.providerSubscription);

  if (!target) {
    return { applied: false as const, reason: "subscription_reference_unresolved" };
  }

  const result = await applyMercadoPagoSubscriptionToAccount({
    accountId: target.accountId,
    accountType: target.accountType,
    admin: params.admin,
    planCode: target.planCode,
    providerSubscription: params.providerSubscription,
    subscriptionId: target.subscriptionId,
    workspaceId: target.workspaceId,
  });

  return {
    applied: true as const,
    matchedBy: target.matchedBy,
    status: result.storedStatus,
    subscriptionId: target.subscriptionId,
  };
}

async function recordRejectedEvent(
  admin: SupabaseAdminClient,
  summary: Record<string, unknown>,
  reason: string,
) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("payment_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "rejected")
    .gte("created_at", since);

  if ((count ?? 0) >= MAX_REJECTED_EVENTS_PER_HOUR) {
    return;
  }

  await admin.from("payment_events").insert({
    error: reason,
    event_id: `rejected:${crypto.randomUUID()}`,
    event_type: typeof summary.eventType === "string" ? summary.eventType : null,
    payload: summary,
    processed: true,
    processed_at: new Date().toISOString(),
    provider: "mercadopago",
    status: "rejected",
  });
}

export function createMercadoPagoWebhookHandler(route: string) {
  return async function POST(request: Request) {
    const url = new URL(request.url);
    const { parseError, payload } = parseBody(await request.text());
    const resourceId = getResourceId(payload, url);
    const eventType = getEventType(payload, url);
    const eventId = getEventId(payload, url, resourceId);
    const summary = {
      action: getEventAction(payload),
      dataId: resourceId,
      eventId,
      eventType,
      liveMode: typeof payload.live_mode === "boolean" ? payload.live_mode : null,
      route,
    };
    const log = (result: string, extra: Record<string, unknown> = {}) =>
      console.info("[mercadopago:webhook]", { ...summary, result, ...extra });
    const admin = getSupabaseAdminClient();

    if (isDashboardTestEvent(payload, url)) {
      log("dashboard_test");
      return NextResponse.json({ ok: true, test: true });
    }

    const signature = verifyMercadoPagoSignature({
      dataId: getSignedDataId(payload, url),
      requestId: request.headers.get("x-request-id"),
      secret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? process.env.MP_WEBHOOK_SECRET,
      signature: request.headers.get("x-signature"),
    });

    if (!signature.valid) {
      log("rejected", { reason: signature.reason });

      if (admin) {
        await recordRejectedEvent(admin, summary, signature.reason).catch(() => undefined);
      }

      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }

    if (!admin) {
      log("failed", { reason: "missing_service_role" });
      return NextResponse.json({ error: "not_configured" }, { status: 500 });
    }

    const { data: inserted, error: insertError } = await admin
      .from("payment_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        payload,
        provider: "mercadopago",
        status: "received",
      })
      .select("id")
      .single();
    let eventRowId = (inserted as { id: string } | null)?.id ?? null;

    if (insertError || !eventRowId) {
      const { data: existing } = await admin
        .from("payment_events")
        .select("id, processed, attempts")
        .eq("provider", "mercadopago")
        .eq("event_id", eventId)
        .maybeSingle();
      const existingEvent = existing as
        | { attempts: number; id: string; processed: boolean }
        | null;

      if (existingEvent?.processed) {
        log("duplicate");
        return NextResponse.json({ duplicate: true, ok: true });
      }

      if (!existingEvent) {
        log("failed", { reason: "event_store_failed" });
        return NextResponse.json({ error: "event_store_failed" }, { status: 500 });
      }

      eventRowId = existingEvent.id;
      await admin
        .from("payment_events")
        .update({ attempts: existingEvent.attempts + 1 })
        .eq("id", eventRowId);
    }

    const finish = async (status: EventStatus, error: string | null = null) => {
      await admin
        .from("payment_events")
        .update({
          error,
          processed: status !== "failed" && status !== "unresolved",
          processed_at: new Date().toISOString(),
          status,
        })
        .eq("id", eventRowId);
    };

    if (parseError || !resourceId || !isSupportedEventType(eventType)) {
      const reason = parseError
        ? "invalid_body"
        : !resourceId
          ? "missing_resource_id"
          : "unsupported_event_type";
      await finish("ignored", reason);
      log("ignored", { reason });
      return NextResponse.json({ ignored: true, ok: true });
    }

    try {
      const providerSubscription = await getProviderSubscriptionFromEvent(eventType, resourceId);

      if (!providerSubscription) {
        await finish("ignored", "subscription_not_found");
        log("ignored", { reason: "subscription_not_found" });
        return NextResponse.json({ ignored: true, ok: true });
      }

      const result = await processMercadoPagoSubscriptionForWebhook({
        admin,
        providerSubscription,
      });

      if (!result.applied) {
        // Queda sin procesar para la reconciliación; reintentar no cambia nada.
        await finish("unresolved", result.reason);
        log("unresolved", { preapprovalId: providerSubscription.id });
        return NextResponse.json({ ok: true, unresolved: true });
      }

      await finish("processed");
      log("processed", {
        matchedBy: result.matchedBy,
        preapprovalId: providerSubscription.id,
        status: result.status,
        subscriptionId: result.subscriptionId,
      });
      return NextResponse.json({ ok: true, status: result.status });
    } catch (error) {
      const message = errorMessage(error, "No pudimos procesar el webhook.");
      await finish("failed", message);
      log("failed", { reason: message });
      return NextResponse.json({ error: "processing_failed" }, { status: 500 });
    }
  };
}
