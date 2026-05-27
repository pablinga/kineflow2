import { NextResponse } from "next/server";
import {
  createMercadoPagoPreapproval,
  isPaidPlan,
  mapMercadoPagoStatus,
} from "@/lib/mercadopago";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { isPlanAllowedForAccount } from "@/lib/billing";
import type { CommercialPlan } from "@/lib/plans";
import type { AccountType } from "@/hooks/useRequireAuth";

const validPlans: CommercialPlan[] = [
  "INDEPENDIENTE",
  "CONSULTORIO_2",
  "CONSULTORIO_5",
  "CONSULTORIO_10",
];

function normalizePlan(value: unknown): CommercialPlan | null {
  return validPlans.includes(value as CommercialPlan)
    ? (value as CommercialPlan)
    : null;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json(
        { error: "Necesitás iniciar sesión para activar un plan." },
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

    if (error || !user?.email) {
      return NextResponse.json(
        { error: "No pudimos validar tu sesión." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const planCode = normalizePlan(body.planId);

    if (!planCode || !isPaidPlan(planCode)) {
      return NextResponse.json(
        { error: "Seleccioná un plan pago válido." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "No encontramos el perfil de la cuenta." },
        { status: 404 },
      );
    }

    const accountType = profile.account_type as AccountType;

    if (!isPlanAllowedForAccount(planCode, accountType)) {
      return NextResponse.json(
        { error: "El plan elegido no corresponde al tipo de cuenta." },
        { status: 403 },
      );
    }

    const { data: plan, error: planError } = await admin
      .from("plans")
      .select("id")
      .eq("code", planCode)
      .eq("active", true)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: "El plan elegido no está disponible." },
        { status: 404 },
      );
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("subscriptions")
      .insert({
        account_id: user.id,
        account_type: accountType,
        plan_id: plan.id,
        provider: "mercadopago",
        status: "PENDING_PAYMENT",
      })
      .select("id")
      .single();

    if (subscriptionError || !subscription) {
      throw subscriptionError ?? new Error("No pudimos crear la suscripción.");
    }

    const mercadoPagoSubscription = await createMercadoPagoPreapproval({
      planId: planCode,
      subscriptionId: subscription.id,
      userEmail: user.email,
      userId: user.id,
    });
    const internalStatus = mapMercadoPagoStatus(mercadoPagoSubscription.status);
    const initPoint =
      mercadoPagoSubscription.init_point ??
      mercadoPagoSubscription.sandbox_init_point;

    await admin
      .from("subscriptions")
      .update({
        provider_subscription_id: mercadoPagoSubscription.id,
        provider_status: mercadoPagoSubscription.status ?? null,
        status: internalStatus,
      })
      .eq("id", subscription.id);

    await admin
      .from("profiles")
      .update({
        plan: planCode,
        estado_plan: "PENDIENTE",
        mercadopago_subscription_id: mercadoPagoSubscription.id,
      })
      .eq("id", user.id);

    return NextResponse.json({
      initPoint,
      status: "ready",
      subscriptionId: subscription.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos crear la suscripción.",
      },
      { status: 500 },
    );
  }
}
