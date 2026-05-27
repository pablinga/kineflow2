import { NextResponse } from "next/server";
import { cancelMercadoPagoSubscription } from "@/lib/mercadopago";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
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
    return NextResponse.json(
      { error: "No encontramos una suscripción activa." },
      { status: 404 },
    );
  }

  const providerSubscription = await cancelMercadoPagoSubscription(
    subscription.provider_subscription_id,
  );

  await admin
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      provider_status: providerSubscription.status ?? "cancelled",
      status: "CANCELLED",
    })
    .eq("id", subscription.id);

  await admin
    .from("profiles")
    .update({
      estado_plan: "CANCELADO",
      plan: "FREE",
    })
    .eq("id", user.id);

  return NextResponse.json({ cancelled: true });
}
