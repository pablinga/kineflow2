import { NextResponse } from "next/server";
import { applyMercadoPagoSubscriptionToAccount } from "@/lib/billing-server";
import {
  getMercadoPagoAccessToken,
  getMercadoPagoSubscription,
  mapMercadoPagoStatus,
} from "@/lib/mercadopago";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

type ConfirmReturnBody = {
  preapprovalId?: unknown;
  returnParams?: Record<string, string>;
};

function getSafeTokenPrefix() {
  const token = getMercadoPagoAccessToken();

  return token ? token.slice(0, 5) : "missing";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitas iniciar sesion para confirmar la suscripcion." },
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

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY para actualizar el plan." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as ConfirmReturnBody;
  const preapprovalId =
    typeof body.preapprovalId === "string" ? body.preapprovalId.trim() : "";

  if (!preapprovalId) {
    console.log("Mercado Pago return without preapproval id", {
      mode: getSafeTokenPrefix() === "TEST-" ? "TEST" : "PROD",
      returnParamKeys: Object.keys(body.returnParams ?? {}),
      tokenPrefix: getSafeTokenPrefix(),
    });

    return NextResponse.json(
      {
        plan: "INDEPENDIENTE",
        status: "PENDIENTE",
        warning:
          "Mercado Pago no envio preapproval_id en el retorno. Esperamos el webhook para confirmar el plan.",
      },
      { status: 202 },
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("account_type, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.account_type && profile.account_type !== "KINESIOLOGO") {
    return NextResponse.json(
      { error: "Este checkout solo corresponde al Plan Independiente." },
      { status: 403 },
    );
  }

  const providerSubscription = await getMercadoPagoSubscription(preapprovalId);
  const internalStatus = mapMercadoPagoStatus(providerSubscription.status);

  console.log("Mercado Pago return verification", {
    internalStatus,
    mode: getSafeTokenPrefix() === "TEST-" ? "TEST" : "PROD",
    payerEmailMatchesUser:
      Boolean(providerSubscription.payer_email && user.email) &&
      providerSubscription.payer_email?.toLowerCase() === user.email?.toLowerCase(),
    preapprovalId,
    providerStatus: providerSubscription.status,
    tokenPrefix: getSafeTokenPrefix(),
  });

  const result = await applyMercadoPagoSubscriptionToAccount({
    accountId: user.id,
    accountType: "KINESIOLOGO",
    admin,
    planCode: "INDEPENDIENTE",
    providerSubscription,
  });

  return NextResponse.json({
    plan: "INDEPENDIENTE",
    providerStatus: result.providerStatus,
    status: result.profileStatus,
  });
}
