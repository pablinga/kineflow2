import { NextResponse } from "next/server";
import { getPermissionsFromPlan } from "@/lib/billing";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import {
  getPatientLimit,
  getPlanDefinition,
  type CommercialPlan,
  type PlanStatus,
} from "@/lib/plans";
import type { AccountType } from "@/hooks/useRequireAuth";
import type { InternalSubscriptionStatus } from "@/lib/billing";

function normalizePlan(value: unknown): CommercialPlan {
  if (
    value === "INDEPENDIENTE" ||
    value === "CONSULTORIO"
  ) {
    return value;
  }

  return "FREE";
}

function normalizeStatus(value: unknown): InternalSubscriptionStatus {
  if (
    value === "ACTIVE" ||
    value === "CANCELLED"
  ) {
    return value;
  }

  return "PENDING_PAYMENT";
}

function mapStatusToPlanStatus(value: InternalSubscriptionStatus): PlanStatus {
  if (value === "ACTIVE") {
    return "ACTIVO";
  }

  if (value === "CANCELLED") {
    return "CANCELADO";
  }

  return "ACTIVO";
}

function getJoinedPlanCode(subscription: unknown) {
  const plans = (subscription as { plans?: { code?: unknown } | Array<{ code?: unknown }> } | null)
    ?.plans;
  const planRow = Array.isArray(plans) ? plans[0] : plans;

  return normalizePlan(planRow?.code);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitás iniciar sesión." },
      { status: 401 },
    );
  }

  const supabase = getSupabaseServerClient(token);
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .single();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, provider_status, current_period_start, current_period_end, plans(code)")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountType = (profile?.account_type ?? "KINESIOLOGO") as AccountType;
  const subscriptionStatus = normalizeStatus(subscription?.status);
  const plan = subscription ? getJoinedPlanCode(subscription) : "FREE";
  const planDefinition = getPlanDefinition(plan);
  const estadoPlan =
    plan === "FREE" ? "ACTIVO" : mapStatusToPlanStatus(subscriptionStatus);

  return NextResponse.json({
    accountType,
    plan,
    estadoPlan,
    limitePacientes: getPatientLimit(plan),
    cantidadKinesiologos: planDefinition.kinesiologistCount,
    subscription: {
      currentPeriodEnd: subscription?.current_period_end ?? null,
      currentPeriodStart: subscription?.current_period_start ?? null,
      providerStatus: subscription?.provider_status ?? null,
      status: subscriptionStatus,
    },
    permissions: getPermissionsFromPlan({
      accountType,
      plan,
      subscriptionStatus: estadoPlan === "ACTIVO" ? "ACTIVE" : subscriptionStatus,
    }),
  });
}
