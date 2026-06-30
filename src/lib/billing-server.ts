import {
  mapMercadoPagoStatus,
  type MercadoPagoPreapproval,
} from "@/lib/mercadopago";
import { sendSubscriptionActivatedEmail } from "@/lib/email";
import type { CommercialPlan } from "@/lib/plans";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

function getSupabaseErrorLog(error: SupabaseErrorLike | null) {
  if (!error) {
    return null;
  }

  return {
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    message: error.message ?? null,
  };
}

function mapToStoredSubscriptionStatus(status: ReturnType<typeof mapMercadoPagoStatus>) {
  if (status === "ACTIVE") {
    return "ACTIVE";
  }

  if (status === "CANCELLED") {
    return "CANCELLED";
  }

  return "FREE";
}

export async function applyMercadoPagoSubscriptionToAccount(params: {
  accountId: string;
  accountType: "KINESIOLOGO" | "CONSULTORIO";
  admin: SupabaseAdminClient;
  planCode: CommercialPlan;
  providerSubscription: MercadoPagoPreapproval;
  workspaceId?: string | null;
}) {
  const { accountId, accountType, admin, planCode, providerSubscription, workspaceId } =
    params;
  const internalStatus = mapMercadoPagoStatus(providerSubscription.status);
  const effectivePlanCode = internalStatus === "ACTIVE" ? planCode : "FREE";
  const storedStatus = mapToStoredSubscriptionStatus(internalStatus);
  const now = new Date().toISOString();
  const periodStart = internalStatus === "ACTIVE" ? now : null;
  const periodEnd = providerSubscription.next_payment_date ?? null;
  const cancelledAt = storedStatus === "CANCELLED" ? now : null;
  const activatedAt = storedStatus === "ACTIVE" ? now : null;

  const { data: planRow, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("code", effectivePlanCode)
    .maybeSingle();

  if (planError || !planRow?.id) {
    console.error("[billing:apply-subscription] Supabase plan lookup failed", {
      accountId,
      planCode: effectivePlanCode,
      supabaseError: getSupabaseErrorLog(planError),
    });

    throw new Error("No encontramos el plan interno para actualizar la cuenta.");
  }

  const subscriptionPayload: Record<string, unknown> = {
    account_id: accountId,
    account_type: accountType,
    activated_at: activatedAt,
    cancel_at_period_end: false,
    canceled_at: cancelledAt,
    cancellation_reason: null,
    cancellation_reference: null,
    current_period_end: periodEnd,
    current_period_start: periodStart,
    plan_id: planRow.id,
    provider: "mercadopago",
    provider_status: providerSubscription.status ?? null,
    provider_subscription_id: providerSubscription.id,
    status: storedStatus,
    updated_at: now,
  };

  if (workspaceId !== undefined) {
    subscriptionPayload.workspace_id = workspaceId;
  }

  console.info("[billing:apply-subscription] Applying Mercado Pago status", {
    accountId,
    effectivePlanCode,
    internalStatus,
    planCode,
    providerStatus: providerSubscription.status,
    providerSubscriptionId: providerSubscription.id,
    storedStatus,
    workspaceId: workspaceId ?? null,
  });

  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("account_id", accountId)
    .maybeSingle();

  const { error: subscriptionUpsertError } = await admin
    .from("subscriptions")
    .upsert(subscriptionPayload, { onConflict: "account_id" });

  if (subscriptionUpsertError) {
    console.error("[billing:apply-subscription] Supabase subscription upsert failed", {
      accountId,
      effectivePlanCode,
      internalStatus,
      planCode,
      providerSubscriptionId: providerSubscription.id,
      storedStatus,
      supabaseError: getSupabaseErrorLog(subscriptionUpsertError),
    });

    throw new Error(
      `No pudimos actualizar la suscripción en Supabase: ${subscriptionUpsertError.message}`,
    );
  }

  console.info("[billing:apply-subscription] Supabase subscription upserted", {
    accountId,
    action:
      storedStatus === "ACTIVE"
        ? "activated_independiente"
        : `set_${storedStatus.toLowerCase()}`,
    internalStatus,
    planCode: effectivePlanCode,
    providerStatus: providerSubscription.status,
    providerSubscriptionId: providerSubscription.id,
    storedStatus,
  });

  if (storedStatus === "ACTIVE" && existingSubscription?.status !== "ACTIVE") {
    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", accountId)
      .maybeSingle();

    await sendSubscriptionActivatedEmail(
      {
        email: (profile as { email?: string | null } | null)?.email,
        fullName: (profile as { full_name?: string | null } | null)?.full_name,
      },
      {
        activatedAt: activatedAt ?? now,
        currentPeriodEnd: periodEnd,
        provider: "mercadopago",
        providerSubscription,
      },
    );
  }

  return {
    internalStatus,
    profileStatus: storedStatus === "ACTIVE" ? "ACTIVO" : "CANCELADO",
    providerStatus: providerSubscription.status ?? null,
    storedStatus,
  };
}
