import { NextResponse } from "next/server";
import { applyMercadoPagoSubscriptionToAccount } from "@/lib/billing-server";
import { getMercadoPagoSubscription } from "@/lib/mercadopago";
import type { CommercialPlan } from "@/lib/plans";
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

  const [accountId, planCode] = reference.split(":");

  if (!accountId || !planCode) {
    return null;
  }

  return {
    accountId,
    planCode: planCode as CommercialPlan,
  };
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitas iniciar sesion para ver el estado de la suscripcion." },
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
            : "No pudimos confirmar la suscripcion.",
        preapproval_id: preapprovalId,
        userId: user.id,
      });
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, estado_plan, fecha_inicio_plan, fecha_fin_plan")
    .eq("id", user.id)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, provider_status, current_period_start, current_period_end")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isActive =
    profile?.plan === "INDEPENDIENTE" &&
    (profile.estado_plan === "ACTIVO" || subscription?.status === "ACTIVE");

  return NextResponse.json({
    plan: profile?.plan ?? "FREE",
    profileStatus: profile?.estado_plan ?? "ACTIVO",
    status: isActive ? "ACTIVO" : "PENDIENTE",
    subscription: {
      currentPeriodEnd:
        subscription?.current_period_end ?? profile?.fecha_fin_plan ?? null,
      currentPeriodStart:
        subscription?.current_period_start ?? profile?.fecha_inicio_plan ?? null,
      providerStatus: subscription?.provider_status ?? null,
      status: subscription?.status ?? null,
    },
  });
}
