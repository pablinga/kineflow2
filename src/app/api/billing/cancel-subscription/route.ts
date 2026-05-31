import { NextResponse } from "next/server";
import { sendSubscriptionCancelledEmail } from "@/lib/email";
import { cancelMercadoPagoSubscription } from "@/lib/mercadopago";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    console.warn("[billing:cancel-subscription] Missing bearer token");
    return NextResponse.json(
      { error: "Necesitás iniciar sesión." },
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
      { error: "No pudimos validar tu sesión." },
      { status: 401 },
    );
  }

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, provider_subscription_id")
    .eq("account_id", user.id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription?.provider_subscription_id) {
    console.warn("[billing:cancel-subscription] Active subscription not found", {
      accountId: user.id,
    });
    return NextResponse.json(
      { error: "No encontramos una suscripción activa." },
      { status: 404 },
    );
  }

  const providerSubscription = await cancelMercadoPagoSubscription(
    subscription.provider_subscription_id,
  );
  const canceledAt = new Date().toISOString();
  const cancellationReference = `KF-BAJA-${Date.now().toString(36).toUpperCase()}`;

  const { error: subscriptionUpdateError } = await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      canceled_at: canceledAt,
      cancellation_reference: cancellationReference,
      provider_status: providerSubscription.status ?? "cancelled",
      status: "CANCELLED",
    })
    .eq("id", subscription.id);

  if (subscriptionUpdateError) {
    console.error("[billing:cancel-subscription] Subscription update failed", {
      accountId: user.id,
      subscriptionId: subscription.id,
    });
    return NextResponse.json(
      { error: "No pudimos registrar la baja de la suscripciÃ³n." },
      { status: 500 },
    );
  }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({
      cancel_request_code: cancellationReference,
      estado_plan: "CANCELADO",
      plan: "FREE",
      plan_status: "canceled",
      subscription_canceled_at: canceledAt,
      updated_at: canceledAt,
    })
    .eq("id", user.id);

  if (profileUpdateError) {
    console.error("[billing:cancel-subscription] Profile update failed", {
      accountId: user.id,
    });
    return NextResponse.json(
      { error: "No pudimos actualizar el estado de tu plan." },
      { status: 500 },
    );
  }

  await sendSubscriptionCancelledEmail(
    {
      email: user.email,
      fullName:
        typeof user.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name
          : null,
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
  });
}
