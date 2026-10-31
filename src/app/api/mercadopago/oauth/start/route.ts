import { NextResponse } from "next/server";
import {
  OAUTH_NONCE_COOKIE,
  OAUTH_STATE_TTL_MS,
  buildAuthorizationUrl,
  createOAuthState,
} from "@/lib/mercadopago-oauth";
import { getMercadoPagoOAuthConfig } from "@/lib/mp-connections";
import { getAuthenticatedUserId } from "@/lib/request-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Arranca la vinculación con Mercado Pago. Devuelve la URL de autorización
// (el navegador no manda el token de Supabase al navegar) y deja el nonce del
// state en una cookie httpOnly que el callback exige.
export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const config = getMercadoPagoOAuthConfig();
  const admin = getSupabaseAdminClient();

  if (!config || !admin) {
    return NextResponse.json(
      { error: "La conexión con Mercado Pago no está disponible todavía." },
      { status: 503 },
    );
  }

  // Por ahora solo kinesiólogos particulares (la seña va a su cuenta).
  const { data: profile } = await admin
    .from("profiles")
    .select("account_type")
    .eq("id", userId)
    .maybeSingle();

  if ((profile as { account_type?: string } | null)?.account_type !== "KINESIOLOGO") {
    return NextResponse.json(
      { error: "Las señas están disponibles para kinesiólogos particulares." },
      { status: 403 },
    );
  }

  const { nonce, state } = createOAuthState({ secret: config.stateSecret, userId });
  const response = NextResponse.json({
    url: buildAuthorizationUrl({ clientId: config.clientId, redirectUri: config.redirectUri, state }),
  });

  response.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    maxAge: OAUTH_STATE_TTL_MS / 1000,
    path: "/api/mercadopago/oauth",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
