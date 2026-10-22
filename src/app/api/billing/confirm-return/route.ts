import { NextResponse } from "next/server";
import { applyMercadoPagoSubscriptionToAccount } from "@/lib/billing-server";
import { getMercadoPagoSubscription } from "@/lib/mercadopago";
import {
  decideReturnConfirmation,
  resolveSubscriptionTarget,
} from "@/lib/mercadopago-subscription-target";
import type { CommercialPlan, PlanStatus } from "@/lib/plans";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type ConfirmReturnBody = {
  preapprovalId?: string;
};

function normalizePlan(value: unknown): CommercialPlan {
  if (
    value === "INDEPENDIENTE" ||
    value === "CONSULTORIO"
  ) {
    return value;
  }

  return "FREE";
}

function getJoinedPlanCode(subscription: unknown) {
  const plans = (subscription as { plans?: { code?: unknown } | Array<{ code?: unknown }> } | null)
    ?.plans;
  const planRow = Array.isArray(plans) ? plans[0] : plans;

  return normalizePlan(planRow?.code);
}

function mapSubscriptionStatusToPlanStatus(status: unknown): PlanStatus {
  if (status === "ACTIVE") {
    return "ACTIVO";
  }

  if (status === "CANCELLED") {
    return "CANCELADO";
  }

  return "ACTIVO";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitás iniciar sesión para ver el estado de la suscripción." },
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
      { error: "No pudimos validar tu sesion." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmReturnBody;
  const preapprovalId = body.preapprovalId?.trim();

  if (preapprovalId) {
    try {
      const admin = getSupabaseAdminClient();
      const providerSubscription = await getMercadoPagoSubscription(preapprovalId);
      // Mismos criterios que el webhook: solo se activa si la preapproval es
      // de quien está logueado (ver decideReturnConfirmation).
      const target = admin
        ? await resolveSubscriptionTarget(admin, providerSubscription)
        : null;
      const decision = decideReturnConfirmation({
        providerStatus: providerSubscription.status,
        target,
        userId: user.id,
      });

      // Sin datos personales en los logs (ni email del pagador).
      console.info("[billing:confirm-return] Mercado Pago preapproval loaded", {
        action: decision.action,
        matchedBy: target?.matchedBy ?? null,
        preapproval_id: providerSubscription.id,
        reason: decision.action === "skip" ? decision.reason : null,
        status: providerSubscription.status ?? null,
        userId: user.id,
      });

      if (admin && decision.action === "apply") {
        await applyMercadoPagoSubscriptionToAccount({
          accountId: user.id,
          accountType: decision.target.accountType,
          admin,
          planCode: decision.target.planCode,
          providerSubscription,
          subscriptionId: decision.target.subscriptionId,
          workspaceId: decision.target.workspaceId,
        });
      } else if (decision.action === "skip" && decision.reason === "other_account") {
        console.warn("[billing:confirm-return] Preapproval belongs to another account", {
          preapproval_id: preapprovalId,
          userId: user.id,
        });
      }
    } catch (confirmError) {
      console.error("[billing:confirm-return] Mercado Pago confirmation failed", {
        error:
          confirmError instanceof Error
            ? confirmError.message
            : "No pudimos confirmar la suscripción.",
        preapproval_id: preapprovalId,
        userId: user.id,
      });
    }
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, provider_status, current_period_start, current_period_end, plans(code)")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscriptionStatus = subscription?.status ?? "FREE";
  const plan = subscription ? getJoinedPlanCode(subscription) : "FREE";
  const profileStatus = mapSubscriptionStatusToPlanStatus(subscriptionStatus);

  const isActive =
    (plan === "INDEPENDIENTE" || plan === "CONSULTORIO") &&
    subscriptionStatus === "ACTIVE";

  return NextResponse.json({
    plan,
    profileStatus,
    status: isActive ? "ACTIVO" : "PENDIENTE",
    subscription: {
      currentPeriodEnd: subscription?.current_period_end ?? null,
      currentPeriodStart: subscription?.current_period_start ?? null,
      providerStatus: subscription?.provider_status ?? null,
      status: subscription?.status ?? null,
    },
  });
}
