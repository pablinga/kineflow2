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

  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("provider", "mercadopago")
    .eq("provider_subscription_id", providerSubscription.id)
    .maybeSingle();

  if (existingSubscription?.id) {
    await admin
      .from("subscriptions")
      .update(subscriptionPayload)
      .eq("id", existingSubscription.id);
  } else {
    await admin.from("subscriptions").insert(subscriptionPayload);
  }

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
      mercado_pago_preapproval_id: providerSubscription.id,
      plan: planCode,
      plan_status: internalStatus === "ACTIVE" ? "active" : internalStatus.toLowerCase(),
      subscription_current_period_end: periodEnd,
      subscription_provider: "mercado_pago",
      subscription_started_at: periodStart ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

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
