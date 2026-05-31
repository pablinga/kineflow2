import { NextResponse } from "next/server";
import {
  createMercadoPagoSubscription,
  getMercadoPagoWebhookUrl,
  getSubscriptionReturnUrls,
} from "@/lib/mercadopago";
import { getPlanDefinition, type CommercialPlan } from "@/lib/plans";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

type CreateSubscriptionBody = {
  planId?: CommercialPlan;
};

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitas iniciar sesion para activar un plan." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as CreateSubscriptionBody;
  const planId = body.planId;

  if (planId !== "INDEPENDIENTE") {
    return NextResponse.json(
      { error: "El MVP1 solo permite activar el Plan Independiente." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.email) {
    return NextResponse.json(
      { error: "No pudimos validar tu usuario para iniciar el checkout." },
      { status: 401 },
    );
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const planDefinition = getPlanDefinition(planId);

  if (!planDefinition.priceAmount) {
    return NextResponse.json(
      { error: "El plan no tiene precio configurado." },
      { status: 500 },
    );
  }

  const returnUrls = getSubscriptionReturnUrls();
  const externalReference = `${user.id}:${planId}:${crypto.randomUUID()}`;
  const notificationUrl = getMercadoPagoWebhookUrl();

  console.info("[billing:create-subscription] Creating Mercado Pago preapproval", {
    accountId: user.id,
    externalReference,
    notificationUrl,
    planId,
    returnUrls,
    userEmail: user.email,
  });

  const providerSubscription = await createMercadoPagoSubscription({
    amount: planDefinition.priceAmount,
    backUrl: returnUrls.success,
    externalReference,
    notificationUrl,
    payerEmail: user.email,
    reason: planDefinition.name,
  });

  const { data: planRow, error: planError } = await admin
    .from("plans")
    .select("id")
    .eq("code", planId)
    .maybeSingle();

  if (planError || !planRow?.id) {
    return NextResponse.json(
      { error: "No encontramos el plan interno para iniciar la suscripcion." },
      { status: 500 },
    );
  }

  const { error: subscriptionError } = await admin.from("subscriptions").insert({
    account_id: user.id,
    account_type: "KINESIOLOGO",
    current_period_end: providerSubscription.next_payment_date ?? null,
    current_period_start: providerSubscription.date_created ?? null,
    plan_id: planRow.id,
    provider: "mercadopago",
    provider_status: providerSubscription.status ?? "pending",
    provider_subscription_id: providerSubscription.id,
    status: "PENDING_PAYMENT",
  });

  if (subscriptionError) {
    console.error("[billing:create-subscription] Supabase insert failed", {
      accountId: user.id,
      error: subscriptionError.message,
      providerSubscriptionId: providerSubscription.id,
    });

    return NextResponse.json(
      { error: "No pudimos registrar la suscripcion pendiente." },
      { status: 500 },
    );
  }

  const initPoint =
    providerSubscription.init_point ?? providerSubscription.sandbox_init_point;

  console.info("[billing:create-subscription] Mercado Pago preapproval created", {
    accountId: user.id,
    initPoint,
    planId,
    providerStatus: providerSubscription.status,
    providerSubscriptionId: providerSubscription.id,
    returnUrlSent: returnUrls.success,
  });

  if (!initPoint) {
    return NextResponse.json(
      { error: "Mercado Pago no devolvio una URL de checkout." },
      { status: 502 },
    );
  }

  return NextResponse.json({
    initPoint,
    providerSubscriptionId: providerSubscription.id,
    returnUrls,
  });
}
