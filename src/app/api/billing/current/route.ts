import { NextResponse } from "next/server";
import { getPermissionsFromPlan } from "@/lib/billing";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { CommercialPlan } from "@/lib/plans";
import type { AccountType } from "@/hooks/useRequireAuth";
import type { InternalSubscriptionStatus } from "@/lib/billing";

function normalizePlan(value: unknown): CommercialPlan {
  if (
    value === "INDEPENDIENTE" ||
    value === "CONSULTORIO_2" ||
    value === "CONSULTORIO_5" ||
    value === "CONSULTORIO_10"
  ) {
    return value;
  }

  return "FREE";
}

function normalizeStatus(value: unknown): InternalSubscriptionStatus {
  if (
    value === "PENDING_PAYMENT" ||
    value === "ACTIVE" ||
    value === "PAUSED" ||
    value === "CANCELLED" ||
    value === "PAST_DUE" ||
    value === "EXPIRED"
  ) {
    return value;
  }

  return value === "ACTIVO" ? "ACTIVE" : "PENDING_PAYMENT";
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

  const supabase = getSupabaseServerClient();
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
    .select("account_type, plan, estado_plan, limite_pacientes, cantidad_kinesiologos")
    .eq("id", user.id)
    .single();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, provider_status, current_period_start, current_period_end")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountType = (profile?.account_type ?? "KINESIOLOGO") as AccountType;
  const plan = normalizePlan(profile?.plan);
  const subscriptionStatus = normalizeStatus(
    subscription?.status ?? profile?.estado_plan,
  );

  return NextResponse.json({
    accountType,
    plan,
    estadoPlan: profile?.estado_plan ?? "ACTIVO",
    limitePacientes: profile?.limite_pacientes ?? 5,
    cantidadKinesiologos: profile?.cantidad_kinesiologos ?? 1,
    subscription: {
      currentPeriodEnd: subscription?.current_period_end ?? null,
      currentPeriodStart: subscription?.current_period_start ?? null,
      providerStatus: subscription?.provider_status ?? null,
      status: subscriptionStatus,
    },
    permissions: getPermissionsFromPlan({
      accountType,
      plan,
      subscriptionStatus,
    }),
  });
}
