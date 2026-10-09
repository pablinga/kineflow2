import type { MercadoPagoPreapproval } from "@/lib/mercadopago";
import {
  buildSubscriptionStatusUpdate,
  mapSubscriptionStatusToProfileStatus,
  type ExistingSubscriptionState,
} from "@/lib/mercadopago-status";
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

export async function applyMercadoPagoSubscriptionToAccount(params: {
  accountId: string;
  accountType: "KINESIOLOGO" | "CONSULTORIO";
  admin: SupabaseAdminClient;
  planCode: CommercialPlan;
  providerSubscription: MercadoPagoPreapproval;
  /** Fila a actualizar. Sin id se busca por cuenta + workspace. */
  subscriptionId?: string | null;
  workspaceId?: string | null;
}) {
  const { accountId, accountType, admin, planCode, providerSubscription, workspaceId } =
    params;
  const now = new Date().toISOString();

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

  let existingQuery = admin
    .from("subscriptions")
    .select("id, status, activated_at, canceled_at, current_period_start");

  if (params.subscriptionId) {
    existingQuery = existingQuery.eq("id", params.subscriptionId);
  } else {
    existingQuery = existingQuery.eq("account_id", accountId);
    // .eq(col, null) no matchea NULL en PostgREST: hace falta .is().
    existingQuery = workspaceId
      ? existingQuery.eq("workspace_id", workspaceId)
      : existingQuery.is("workspace_id", null);
  }

  const { data: existingSubscription, error: existingError } =
    await existingQuery.maybeSingle();

  if (existingError) {
    console.error("[billing:apply-subscription] Subscription lookup failed", {
      accountId,
      supabaseError: getSupabaseErrorLog(existingError),
    });

    throw new Error("No pudimos leer la suscripción en Supabase.");
  }

  const existing = existingSubscription as
    | ({ id: string } & NonNullable<ExistingSubscriptionState>)
    | null;
  const statusUpdate = buildSubscriptionStatusUpdate(providerSubscription, existing, now);
  const subscriptionPayload = {
    ...statusUpdate,
    account_id: accountId,
    account_type: accountType,
    cancel_at_period_end: false,
    cancellation_reason: null,
    cancellation_reference: null,
    // Se guarda el plan pedido aunque todavía no esté activo: el acceso lo
    // decide el estado (get_account_access_level solo mira ACTIVE).
    plan_id: planRow.id,
    provider: "mercadopago",
    updated_at: now,
    workspace_id: workspaceId ?? null,
  };

  const { error: saveError } = existing
    ? await admin.from("subscriptions").update(subscriptionPayload).eq("id", existing.id)
    : await admin.from("subscriptions").insert(subscriptionPayload);

  if (saveError) {
    console.error("[billing:apply-subscription] Supabase subscription save failed", {
      accountId,
      planCode,
      providerSubscriptionId: providerSubscription.id,
      status: statusUpdate.status,
      supabaseError: getSupabaseErrorLog(saveError),
    });

    throw new Error(
      `No pudimos actualizar la suscripción en Supabase: ${saveError.message}`,
    );
  }

  console.info("[billing:apply-subscription] Subscription saved", {
    accountId,
    planCode,
    previousStatus: existing?.status ?? null,
    providerStatus: providerSubscription.status ?? null,
    providerSubscriptionId: providerSubscription.id,
    status: statusUpdate.status,
    subscriptionId: existing?.id ?? null,
  });

  if (statusUpdate.status === "ACTIVE" && existing?.status !== "ACTIVE") {
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
        activatedAt: statusUpdate.activated_at ?? now,
        currentPeriodEnd: statusUpdate.current_period_end,
        provider: "mercadopago",
        providerSubscription,
      },
    );
  }

  return {
    internalStatus: statusUpdate.status,
    profileStatus: mapSubscriptionStatusToProfileStatus(statusUpdate.status),
    providerStatus: providerSubscription.status ?? null,
    storedStatus: statusUpdate.status,
  };
}
