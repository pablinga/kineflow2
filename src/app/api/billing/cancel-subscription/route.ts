import { NextResponse } from "next/server";
import { sendSubscriptionCancelledEmail } from "@/lib/email";
import { cancelMercadoPagoSubscription } from "@/lib/mercadopago";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

function isAlreadyCancelledPreapprovalError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("cancelled preapproval")
  );
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    console.warn("[billing:cancel-subscription] Missing bearer token");
    return NextResponse.json(
      { error: "Necesitas iniciar sesion." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseServerClient();
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    console.warn("[billing:cancel-subscription] Invalid bearer token");
    return NextResponse.json(
      { error: "No pudimos validar tu sesion." },
      { status: 401 },
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, provider_subscription_id")
    .eq("account_id", user.id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const preapprovalId = subscription?.provider_subscription_id;

  if (!preapprovalId) {
    console.warn("[billing:cancel-subscription] Active subscription not found", {
      accountId: user.id,
    });
    return NextResponse.json(
      { error: "No encontramos una suscripción activa para cancelar." },
      { status: 404 },
    );
  }

  let providerSubscription;

  try {
    providerSubscription = await cancelMercadoPagoSubscription(preapprovalId);
  } catch (error) {
    if (isAlreadyCancelledPreapprovalError(error)) {
      console.info("[billing:cancel-subscription] Mercado Pago already cancelled", {
        error: error.message,
        preapproval_id: preapprovalId,
        user_id: user.id,
      });

      providerSubscription = {
        id: preapprovalId,
        status: "cancelled",
      };
    } else {
      console.error("[billing:cancel-subscription] Mercado Pago cancellation failed", {
        error: error instanceof Error ? error.message : error,
        preapproval_id: preapprovalId,
        user_id: user.id,
      });

      return NextResponse.json(
        {
          error:
          "No pudimos cancelar la suscripción en este momento. Intentá nuevamente.",
        },
        { status: 502 },
      );
    }
  }

  const canceledAt = new Date().toISOString();
  const cancellationReference = `KF-BAJA-${Date.now().toString(36).toUpperCase()}`;

  if (subscription?.id) {
    const { error: subscriptionUpdateError } = await admin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        canceled_at: canceledAt,
        cancellation_reference: cancellationReference,
        provider_status: providerSubscription.status ?? "cancelled",
        status: "CANCELLED",
        updated_at: canceledAt,
      })
      .eq("id", subscription.id);

    if (subscriptionUpdateError) {
      console.error("[billing:cancel-subscription] Subscription update failed", {
        accountId: user.id,
        subscriptionId: subscription.id,
      });
      return NextResponse.json(
        { error: "No pudimos registrar la baja de la suscripción." },
        { status: 500 },
      );
    }
  }

  console.info("[billing:cancel-subscription] Supabase cancellation applied", {
    action: "set_free_cancelled",
    preapproval_id: preapprovalId,
    status_recibido: providerSubscription.status ?? "cancelled",
    user_id: user.id,
  });

  await sendSubscriptionCancelledEmail(
    {
      email:
        (profile as { email?: string | null } | null)?.email ?? user.email,
      fullName:
        (profile as { full_name?: string | null } | null)?.full_name ??
        (typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null),
    },
    {
      canceledAt,
      cancellationReference,
      provider: "mercadopago",
    },
  );

  return NextResponse.json({
    cancelled: true,
    cancellationReference,
    message: "La suscripción fue cancelada correctamente.",
  });
}
