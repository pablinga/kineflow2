// A qué cuenta y fila de subscriptions corresponde una preapproval de Mercado
// Pago. La usan el webhook y la vuelta del pago (confirm-return), así las dos
// asocian una suscripción con los mismos criterios. Sin dependencias del
// servidor (recibe el cliente admin), para poder testearla.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MercadoPagoPreapproval } from "./mercadopago.ts";
import type { CommercialPlan } from "./plans.ts";

type SupabaseAdminClient = Pick<SupabaseClient, "from">;

/** Referencias fijas que Mercado Pago pone en las preapprovals de los planes. */
const PLAN_EXTERNAL_REFERENCES: Record<string, CommercialPlan> = {
  KINECONSU: "CONSULTORIO",
  KINEINDEP: "INDEPENDIENTE",
  KINEPART: "INDEPENDIENTE",
};

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
export function parseExternalReference(reference: string) {
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

export type ReturnConfirmationDecision =
  | { action: "apply"; target: SubscriptionTarget }
  | { action: "skip"; reason: "unresolved" | "other_account" | "not_authorized" };

/**
 * Vuelta del pago (confirm-return): el id de la preapproval lo manda el
 * navegador, así que solo se activa un plan si la preapproval se asocia, con
 * los mismos criterios que el webhook, a la cuenta de quien está logueado.
 * Nada de adivinar por "no trae email" o "trae la referencia fija del plan":
 * eso dejaba activar un plan con la preapproval de otra persona. Lo que no se
 * pueda asociar acá lo resuelve el webhook (o la reconciliación manual).
 */
export function decideReturnConfirmation(params: {
  providerStatus: string | null | undefined;
  target: SubscriptionTarget | null;
  userId: string;
}): ReturnConfirmationDecision {
  if (!params.target) {
    return { action: "skip", reason: "unresolved" };
  }

  if (params.target.accountId !== params.userId) {
    return { action: "skip", reason: "other_account" };
  }

  if (params.providerStatus !== "authorized") {
    return { action: "skip", reason: "not_authorized" };
  }

  return { action: "apply", target: params.target };
}
