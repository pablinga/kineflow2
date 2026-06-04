import { NextResponse } from "next/server";
import {
  createMercadoPagoSubscriptionPreapproval,
  getMercadoPagoCheckoutInitPoint,
  getMercadoPagoWebhookUrl,
  getSubscriptionReturnUrls,
} from "@/lib/mercadopago";
import type { CommercialPlan } from "@/lib/plans";
import { getSupabaseServerClient } from "@/lib/supabase-server";

type CreateSubscriptionBody = {
  planId?: CommercialPlan;
};

function redactWebhookUrlForLogs(value: string) {
  const url = new URL(value);

  if (url.searchParams.has("x-vercel-protection-bypass")) {
    url.searchParams.set("x-vercel-protection-bypass", "[redacted]");
  }

  return url.toString();
}

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

  const returnUrls = getSubscriptionReturnUrls();
  const externalReference = `${user.id}:${planId}:${crypto.randomUUID()}`;
  const notificationUrl = getMercadoPagoWebhookUrl();
  const createLogContext = {
    accountId: user.id,
    externalReference,
    notificationUrlSent: redactWebhookUrlForLogs(notificationUrl),
    planId,
    returnUrlSent: returnUrls.success,
    userEmail: user.email,
  };
  let providerSubscription: Awaited<
    ReturnType<typeof createMercadoPagoSubscriptionPreapproval>
  >;

  try {
    providerSubscription = await createMercadoPagoSubscriptionPreapproval({
      backUrl: returnUrls.success,
      externalReference,
      payerEmail: user.email,
      planId,
    });
  } catch (error) {
    console.error("[billing:create-subscription] Mercado Pago preapproval failed", {
      ...createLogContext,
      error:
        error instanceof Error ? error.message : "No pudimos crear la suscripcion.",
    });

    return NextResponse.json(
      { error: "No pudimos iniciar el checkout de Mercado Pago." },
      { status: 502 },
    );
  }

  const initPoint = getMercadoPagoCheckoutInitPoint(
    providerSubscription.sandbox_init_point ?? providerSubscription.init_point ?? "",
  );

  if (!initPoint) {
    return NextResponse.json(
      { error: "Mercado Pago no devolvio una URL de checkout." },
      { status: 502 },
    );
  }

  console.info("[billing:create-subscription] Mercado Pago checkout URL created", {
    ...createLogContext,
    initPoint,
    returnUrls,
  });

  return NextResponse.json({
    externalReference,
    initPoint,
    returnUrls,
  });
}
