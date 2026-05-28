import {
  mapMercadoPagoStatus,
  mapSubscriptionStatusToProfileStatus,
  type MercadoPagoPreapproval,
} from "@/lib/mercadopago";
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
    .select("id")
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
      plan: planCode,
    })
    .eq("id", accountId);

  return {
    internalStatus,
    profileStatus,
    providerStatus: providerSubscription.status ?? null,
  };
}
