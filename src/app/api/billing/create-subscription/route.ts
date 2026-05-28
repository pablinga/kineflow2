import { NextResponse } from "next/server";
import {
  getMercadoPagoPreapprovalPlanId,
  getMercadoPagoSubscriptionCheckoutUrl,
  isPaidPlan,
} from "@/lib/mercadopago";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { isPlanAllowedForAccount } from "@/lib/billing";
import type { CommercialPlan } from "@/lib/plans";
import type { AccountType } from "@/hooks/useRequireAuth";
import type { SupabaseClient, User } from "@supabase/supabase-js";

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

function getAccountTypeFromUser(user: User): AccountType {
  const metadataAccountType = user.user_metadata?.account_type;

  if (metadataAccountType === "CONSULTORIO") {
    return "CONSULTORIO";
  }

  return "KINESIOLOGO";
}

async function getOrCreateProfile(admin: SupabaseClient, user: User) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  if (profile) {
    return profile;
  }

  const accountType = getAccountTypeFromUser(user);
  const fullName =
    typeof user.user_metadata?.full_name === "string" &&
    user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : user.email?.split("@")[0] ?? "Usuario";
  const organizationName =
    typeof user.user_metadata?.organization_name === "string" &&
    user.user_metadata.organization_name.trim()
      ? user.user_metadata.organization_name.trim()
      : fullName;

  const { data: createdProfile, error: createProfileError } = await admin
    .from("profiles")
    .insert({
      account_type: accountType,
      email: user.email?.toLowerCase() ?? null,
      full_name: accountType === "CONSULTORIO" ? organizationName : fullName,
      id: user.id,
      license_number:
        accountType === "KINESIOLOGO"
          ? user.user_metadata?.license_number ?? null
          : null,
      organization_address:
        accountType === "CONSULTORIO"
          ? user.user_metadata?.organization_address ?? null
          : null,
      organization_name:
        accountType === "CONSULTORIO" ? organizationName : null,
      phone: user.user_metadata?.phone ?? null,
      responsible_name:
        accountType === "CONSULTORIO"
          ? user.user_metadata?.responsible_name ?? null
          : null,
      role: accountType === "CONSULTORIO" ? "clinic" : "kinesiologist",
      specialty:
        accountType === "KINESIOLOGO"
          ? user.user_metadata?.specialty ?? null
          : null,
    })
    .select("account_type")
    .single();

  if (createProfileError || !createdProfile) {
    throw createProfileError ?? new Error("No pudimos crear el perfil.");
  }

  if (accountType === "CONSULTORIO") {
    await admin.from("clinics").insert({
      address: user.user_metadata?.organization_address ?? null,
      email: user.email?.toLowerCase() ?? null,
      name: organizationName,
      owner_id: user.id,
      phone: user.user_metadata?.phone ?? null,
      responsible_name: user.user_metadata?.responsible_name ?? null,
    });
  }

  return createdProfile;
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

    const profile = await getOrCreateProfile(admin, user);

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

    const initPoint = getMercadoPagoSubscriptionCheckoutUrl(planCode);
    const preapprovalPlanId = getMercadoPagoPreapprovalPlanId(planCode);

    console.info("Mercado Pago subscription checkout selected", {
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      linkSource: "preapproval_plan_checkout",
      planId: planCode,
      preapprovalPlanId,
    });

    await admin
      .from("profiles")
      .update({
        plan: planCode,
        estado_plan: "PENDIENTE",
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
