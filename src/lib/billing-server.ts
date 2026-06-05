import {
  mapMercadoPagoStatus,
  mapSubscriptionStatusToProfileStatus,
  type MercadoPagoPreapproval,
} from "@/lib/mercadopago";
import { sendSubscriptionActivatedEmail } from "@/lib/email";
import { getPlanDefinition, type CommercialPlan } from "@/lib/plans";
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

export async function applyMercadoPagoSubscriptionToAccount(params: {
  accountId: string;
  accountType: "KINESIOLOGO" | "CONSULTORIO";
  admin: SupabaseAdminClient;
  planCode: CommercialPlan;
  providerSubscription: MercadoPagoPreapproval;
}) {
  const { accountId, accountType, admin, planCode, providerSubscription } =
    params;
  const internalStatus = mapMercadoPagoStatus(providerSubscription.status);
  const profileStatus = mapSubscriptionStatusToProfileStatus(internalStatus);
  const effectivePlanCode = internalStatus === "ACTIVE" ? planCode : "FREE";
  const planDefinition = getPlanDefinition(effectivePlanCode);
  const periodStart = providerSubscription.date_created ?? null;
  const periodEnd = providerSubscription.next_payment_date ?? null;
  const cancelledAt =
    internalStatus === "CANCELLED" ? new Date().toISOString() : null;

  const { data: planRow, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("code", planCode)
    .maybeSingle();

  if (planError || !planRow?.id) {
    console.error("[billing:apply-subscription] Supabase plan lookup failed", {
      accountId,
      planCode,
      supabaseError: getSupabaseErrorLog(planError),
    });

    throw new Error("No encontramos el plan interno para actualizar la cuenta.");
  }

  const subscriptionPayload = {
    account_id: accountId,
    account_type: accountType,
    current_period_end: periodEnd,
    current_period_start: periodStart,
    plan_id: planRow.id,
    provider: "mercadopago",
    provider_status: providerSubscription.status ?? null,
    provider_subscription_id: providerSubscription.id,
    status: internalStatus,
    cancel_at_period_end: internalStatus === "CANCELLED",
    canceled_at: cancelledAt,
  };

  console.info("[billing:apply-subscription] Applying Mercado Pago status", {
    accountId,
    internalStatus,
    planCode,
    profileStatus,
    providerStatus: providerSubscription.status,
    providerSubscriptionId: providerSubscription.id,
  });

  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("provider", "mercadopago")
    .eq("provider_subscription_id", providerSubscription.id)
    .maybeSingle();

  if (existingSubscription?.id) {
    const { error: subscriptionUpdateError } = await admin
      .from("subscriptions")
      .update(subscriptionPayload)
      .eq("id", existingSubscription.id);

    if (subscriptionUpdateError) {
      console.error("[billing:apply-subscription] Supabase subscription update failed", {
        accountId,
        providerSubscriptionId: providerSubscription.id,
        subscriptionId: existingSubscription.id,
        supabaseError: getSupabaseErrorLog(subscriptionUpdateError),
      });

      throw new Error(
        `No pudimos actualizar la suscripcion en Supabase: ${subscriptionUpdateError.message}`,
      );
    }
  } else {
    const { error: subscriptionInsertError } = await admin
      .from("subscriptions")
      .insert(subscriptionPayload);

    if (subscriptionInsertError) {
      console.error("[billing:apply-subscription] Supabase subscription insert failed", {
        accountId,
        providerSubscriptionId: providerSubscription.id,
        supabaseError: getSupabaseErrorLog(subscriptionInsertError),
      });

      throw new Error(
        `No pudimos crear la suscripcion en Supabase: ${subscriptionInsertError.message}`,
      );
    }
  }

  const { error: profileUpdateError } = await admin
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
      mercado_pago_status: providerSubscription.status ?? null,
      mercado_pago_preapproval_id: providerSubscription.id,
      plan: effectivePlanCode,
      plan_status:
        internalStatus === "CANCELLED"
          ? "cancelled"
          : internalStatus.toLowerCase(),
      cancelled_at: cancelledAt,
      subscription_current_period_end: periodEnd,
      subscription_canceled_at: cancelledAt,
      subscription_provider: "mercado_pago",
      subscription_started_at: periodStart ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (profileUpdateError) {
    console.error("[billing:apply-subscription] Supabase profile update failed", {
      accountId,
      effectivePlanCode,
      internalStatus,
      planCode,
      profileStatus,
      providerSubscriptionId: providerSubscription.id,
      supabaseError: getSupabaseErrorLog(profileUpdateError),
    });

    throw new Error(
      `No pudimos actualizar el plan del usuario en Supabase: ${profileUpdateError.message}`,
    );
  }

  console.info("[billing:apply-subscription] Supabase profile updated", {
    accountId,
    action:
      internalStatus === "ACTIVE"
        ? "activated_independiente"
        : `set_free_${internalStatus.toLowerCase()}`,
    internalStatus,
    planCode: effectivePlanCode,
    profileStatus,
    providerStatus: providerSubscription.status,
    providerSubscriptionId: providerSubscription.id,
  });

  if (internalStatus === "ACTIVE" && existingSubscription?.status !== "ACTIVE") {
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
        activatedAt: periodStart ?? new Date().toISOString(),
        currentPeriodEnd: periodEnd,
        provider: "mercadopago",
        providerSubscription,
      },
    );
  }

  return {
    internalStatus,
    profileStatus,
    providerStatus: providerSubscription.status ?? null,
  };
}
