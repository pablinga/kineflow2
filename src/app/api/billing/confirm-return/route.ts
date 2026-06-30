import { NextResponse } from "next/server";
import { applyMercadoPagoSubscriptionToAccount } from "@/lib/billing-server";
import { getMercadoPagoSubscription } from "@/lib/mercadopago";
import type { CommercialPlan, PlanStatus } from "@/lib/plans";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type ConfirmReturnBody = {
  preapprovalId?: string;
};

const MERCADOPAGO_PLAN_EXTERNAL_REFERENCES = new Set(["KINEPART", "KINEINDEP"]);

function parseExternalReference(reference: unknown) {
  if (typeof reference !== "string") {
    return null;
  }

  const parts = reference.split(":");
  const [accountId, planCode] = parts;

  if (!accountId || !planCode) {
    return null;
  }

  const hasWorkspaceSegment = parts.length >= 4;
  const workspaceId = hasWorkspaceSegment ? parts[2] : null;

  return {
    accountId,
    planCode: planCode as CommercialPlan,
    workspaceId:
      workspaceId && workspaceId !== "account" ? workspaceId : null,
  };
}

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

  const supabase = getSupabaseServerClient();
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
      const parsed = parseExternalReference(providerSubscription.external_reference);
      const payerEmail = providerSubscription.payer_email?.trim().toLowerCase() ?? "";
      const userEmail = user.email?.trim().toLowerCase() ?? "";
      const externalReference =
        providerSubscription.external_reference?.trim().toUpperCase() ?? "";
      const belongsToUser =
        parsed?.accountId === user.id ||
        !payerEmail ||
        payerEmail === userEmail ||
        MERCADOPAGO_PLAN_EXTERNAL_REFERENCES.has(externalReference);

      console.info("[billing:confirm-return] Mercado Pago preapproval loaded", {
        belongsToUser,
        externalReference: providerSubscription.external_reference ?? null,
        payerEmail: providerSubscription.payer_email ?? null,
        preapproval_id: providerSubscription.id,
        status: providerSubscription.status ?? null,
        userId: user.id,
      });

      if (admin && belongsToUser && providerSubscription.status === "authorized") {
        await applyMercadoPagoSubscriptionToAccount({
          accountId: user.id,
          accountType: "KINESIOLOGO",
          admin,
          planCode: parsed?.planCode === "INDEPENDIENTE" ? parsed.planCode : "INDEPENDIENTE",
          providerSubscription,
          workspaceId: parsed?.workspaceId ?? undefined,
        });
      } else if (!belongsToUser) {
        console.warn("[billing:confirm-return] Preapproval does not belong to user", {
          externalReference: providerSubscription.external_reference ?? null,
          payerEmail: providerSubscription.payer_email ?? null,
          preapproval_id: preapprovalId,
          userEmail: user.email ?? null,
          userId: user.id,
        });
      } else if (providerSubscription.status !== "authorized") {
        console.info("[billing:confirm-return] Preapproval not authorized yet", {
          preapproval_id: preapprovalId,
          status: providerSubscription.status ?? null,
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
  const plan =
    subscriptionStatus === "ACTIVE" ? getJoinedPlanCode(subscription) : "FREE";
  const profileStatus = mapSubscriptionStatusToPlanStatus(subscriptionStatus);

  const isActive = plan === "INDEPENDIENTE" && subscriptionStatus === "ACTIVE";

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
