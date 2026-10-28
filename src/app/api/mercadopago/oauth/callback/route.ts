import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/mercadopago";
import {
  OAUTH_NONCE_COOKIE,
  requestOAuthToken,
  verifyOAuthState,
} from "@/lib/mercadopago-oauth";
import { getMercadoPagoOAuthConfig, saveConnectionFromToken } from "@/lib/mp-connections";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Vuelta de la autorización de Mercado Pago: valida el state (firma,
// vencimiento y nonce de la cookie), cambia el código por los tokens y los
// guarda cifrados. Siempre termina en Configuración → Señas con el resultado.
function backToSettings(result: string) {
  const response = NextResponse.redirect(
    `${getAppUrl()}/dashboard/configuracion?mp=${result}#senas`,
  );
  response.cookies.delete({ name: OAUTH_NONCE_COOKIE, path: "/api/mercadopago/oauth" });
  return response;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const config = getMercadoPagoOAuthConfig();
  const admin = getSupabaseAdminClient();

  if (!config || !admin) {
    return backToSettings("no_configurado");
  }

  // El profesional rechazó el permiso en Mercado Pago.
  if (url.searchParams.get("error")) {
    return backToSettings("cancelado");
  }

  const check = verifyOAuthState({
    cookieNonce: request.cookies.get(OAUTH_NONCE_COOKIE)?.value,
    secret: config.stateSecret,
    state: url.searchParams.get("state"),
  });
  const code = url.searchParams.get("code");

  if (!check.ok || !code) {
    console.warn("[mp-oauth] callback rejected", { reason: check.ok ? "missing_code" : check.reason });
    return backToSettings("error");
  }

  try {
    const token = await requestOAuthToken({
      apiUrl: config.apiUrl,
      body: { code, grant_type: "authorization_code", redirect_uri: config.redirectUri },
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    await saveConnectionFromToken({ admin, config, professionalId: check.userId, token });
    return backToSettings("conectado");
  } catch (error) {
    console.error("[mp-oauth] token exchange failed", {
      message: error instanceof Error ? error.message : "unknown",
      userId: check.userId,
    });
    return backToSettings("error");
  }
}
