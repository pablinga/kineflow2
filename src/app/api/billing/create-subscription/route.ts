import { NextResponse } from "next/server";
import {
  getMercadoPagoCheckoutInitPoint,
  getMercadoPagoSubscriptionCheckoutUrl,
  getSubscriptionReturnUrls,
} from "@/lib/mercadopago";
import type { CommercialPlan } from "@/lib/plans";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type CreateSubscriptionBody = {
  planId?: CommercialPlan;
  workspaceId?: string | null;
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
  const workspaceId = body.workspaceId?.trim() || null;

  if (planId !== "INDEPENDIENTE") {
    return NextResponse.json(
      { error: "El MVP1 solo permite activar KineFlow - Particular." },
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

  if (workspaceId) {
    const admin = getSupabaseAdminClient();

    if (!admin) {
      return NextResponse.json(
        { error: "No pudimos validar el espacio de trabajo para iniciar el checkout." },
        { status: 500 },
      );
    }

    const { data: workspace } = await admin
      .from("workspaces")
      .select("id, owner_id, type")
      .eq("id", workspaceId)
      .maybeSingle();

    if (
      !workspace ||
      workspace.type !== "PERSONAL" ||
      workspace.owner_id !== user.id
    ) {
      return NextResponse.json(
        { error: "Este plan solo puede activarse en tu workspace personal." },
        { status: 403 },
      );
    }
  }

  const returnUrls = getSubscriptionReturnUrls();
  const externalReference = `${user.id}:${planId}:${workspaceId ?? "account"}:${crypto.randomUUID()}`;
  const checkoutUrl = getMercadoPagoSubscriptionCheckoutUrl(planId, {
    backUrl: returnUrls.success,
    externalReference,
    payerEmail: user.email,
  });
  const initPoint = getMercadoPagoCheckoutInitPoint(checkoutUrl);

  if (!initPoint) {
    return NextResponse.json(
      { error: "Mercado Pago no devolvio una URL de checkout." },
      { status: 502 },
    );
  }

  console.info("[billing:create-subscription] Mercado Pago checkout URL created", {
    accountId: user.id,
    externalReference,
    initPoint,
    planId,
    returnUrlSent: returnUrls.success,
    returnUrls,
    userEmail: user.email,
  });

  return NextResponse.json({
    externalReference,
    initPoint,
    returnUrls,
  });
}
