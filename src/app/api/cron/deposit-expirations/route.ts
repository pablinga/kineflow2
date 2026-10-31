import { NextRequest, NextResponse } from "next/server";
import { expireAwaitingDeposits } from "@/lib/deposit-payments";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Cron cada 5 minutos (pg_cron, 202610280004): libera los turnos con seña sin
// pagar cuyo plazo venció (quedan cancelados con deposit_status = 'expired').
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase admin no está configurado." }, { status: 500 });
  }

  try {
    const released = await expireAwaitingDeposits(admin);
    return NextResponse.json({ released });
  } catch (error) {
    console.error("[deposits] expiration cron failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "expiration_failed" }, { status: 500 });
  }
}
