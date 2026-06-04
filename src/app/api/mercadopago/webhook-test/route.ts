import { NextResponse } from "next/server";
import { getMercadoPagoSubscription } from "@/lib/mercadopago";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { processMercadoPagoSubscriptionForWebhook } from "@/app/api/webhooks/mercadopago/route";

type WebhookTestBody = {
  preapproval_id?: string;
  preapprovalId?: string;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as WebhookTestBody;
  const preapprovalId = (body.preapproval_id ?? body.preapprovalId)?.trim();

  if (!preapprovalId) {
    return NextResponse.json(
      { error: "Falta preapproval_id para simular el webhook." },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Falta SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  try {
    const providerSubscription = await getMercadoPagoSubscription(preapprovalId);

    console.info("[mercadopago:webhook-test] Preapproval loaded", {
      externalReference: providerSubscription.external_reference ?? null,
      payerEmail: providerSubscription.payer_email ?? null,
      preapproval_id: providerSubscription.id,
      status: providerSubscription.status ?? null,
    });

    if (providerSubscription.status !== "authorized") {
      return NextResponse.json({
        ok: true,
        processed: false,
        preapproval_id: providerSubscription.id,
        reason: "preapproval_not_authorized",
        status: providerSubscription.status ?? null,
      });
    }

    const processingResult = await processMercadoPagoSubscriptionForWebhook({
      admin,
      eventId: `webhook-test:${providerSubscription.id}`,
      providerSubscription,
    });

    return NextResponse.json({
      ok: true,
      preapproval_id: providerSubscription.id,
      processed: true,
      processingResult,
      status: providerSubscription.status ?? null,
    });
  } catch (error) {
    console.error("[mercadopago:webhook-test] Processing failed", {
      error:
        error instanceof Error ? error.message : "No pudimos simular el webhook.",
      preapproval_id: preapprovalId,
    });

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "No pudimos simular el webhook.",
      },
      { status: 500 },
    );
  }
}
