import {
  mapMercadoPagoStatus,
  mapSubscriptionStatusToProfileStatus,
  type MercadoPagoPreapproval,
} from "@/lib/mercadopago";
import { sendSubscriptionActivatedEmail } from "@/lib/email";
import { getPlanDefinition, type CommercialPlan } from "@/lib/plans";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

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
  const planDefinition = getPlanDefinition(planCode);
  const periodStart = providerSubscription.date_created ?? null;
  const periodEnd = providerSubscription.next_payment_date ?? null;

  const { data: planRow, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("code", planCode)
    .maybeSingle();

  if (planError || !planRow?.id) {
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
      throw new Error("No pudimos actualizar la suscripcion en Supabase.");
    }
  } else {
    const { error: subscriptionInsertError } = await admin
      .from("subscriptions")
      .insert(subscriptionPayload);

    if (subscriptionInsertError) {
      throw new Error("No pudimos crear la suscripcion en Supabase.");
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
      mercado_pago_preapproval_id: providerSubscription.id,
      plan: planCode,
      plan_status: internalStatus === "ACTIVE" ? "active" : internalStatus.toLowerCase(),
      subscription_current_period_end: periodEnd,
      subscription_provider: "mercado_pago",
      subscription_started_at: periodStart ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  if (profileUpdateError) {
    throw new Error("No pudimos actualizar el plan del usuario en Supabase.");
  }

  console.info("[billing:apply-subscription] Supabase profile updated", {
    accountId,
    internalStatus,
    planCode,
    profileStatus,
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
