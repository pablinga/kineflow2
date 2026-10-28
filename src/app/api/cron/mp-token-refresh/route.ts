import { NextRequest, NextResponse } from "next/server";
import {
  getMercadoPagoOAuthConfig,
  listConnectionsToRefresh,
  refreshConnection,
} from "@/lib/mp-connections";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Cron diario (pg_cron, 202610280002): renueva los tokens de Mercado Pago que
// vencen en menos de 30 días. Si falla, refreshConnection avisa por mail.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const config = getMercadoPagoOAuthConfig();

  if (!admin || !config) {
    return NextResponse.json({ skipped: true });
  }

  const rows = await listConnectionsToRefresh(admin);
  let refreshed = 0;

  for (const row of rows) {
    const result = await refreshConnection(admin, config, row);

    if (result.ok) {
      refreshed += 1;
    }
  }

  return NextResponse.json({ checked: rows.length, refreshed });
}
