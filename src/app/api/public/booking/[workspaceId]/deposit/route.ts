import { NextRequest, NextResponse } from "next/server";
import { getDepositBookingStatus, processDepositPayment } from "@/lib/deposit-payments";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

// Estado real de una reserva con seña, para las páginas de retorno del
// checkout. Si Mercado Pago volvió con un payment_id y el turno sigue
// esperando, se consulta el pago (mismo procesamiento idempotente que el
// webhook): así la página no depende de que el webhook ya haya llegado.
export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const url = new URL(request.url);
  const appointmentId = url.searchParams.get("turno") ?? "";
  const paymentId = url.searchParams.get("payment_id")?.trim() ?? "";
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase admin no está configurado." }, { status: 500 });
  }

  if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(appointmentId)) {
    return NextResponse.json({ error: "No encontramos la reserva." }, { status: 404 });
  }

  let status = await getDepositBookingStatus(admin, workspaceId, appointmentId);

  if (!status) {
    return NextResponse.json({ error: "No encontramos la reserva." }, { status: 404 });
  }

  if (status.depositStatus === "awaiting" && /^\d{1,20}$/.test(paymentId)) {
    try {
      await processDepositPayment({ admin, appointmentId, paymentId });
      status = (await getDepositBookingStatus(admin, workspaceId, appointmentId)) ?? status;
    } catch (error) {
      console.error("[deposits] return check failed", {
        appointmentId,
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  return NextResponse.json({ booking: status });
}
