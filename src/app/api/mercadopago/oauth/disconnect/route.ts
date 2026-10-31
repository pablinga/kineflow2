import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/request-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Desvincula Mercado Pago: borra los tokens guardados. Las reservas siguientes
// entran sin seña (la configuración de la seña se conserva para reconectar).
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  const admin = getSupabaseAdminClient();

  if (!userId || !admin) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const { error } = await admin.from("mp_connections").delete().eq("professional_id", userId);

  if (error) {
    return NextResponse.json({ error: "No pudimos desconectar Mercado Pago." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
