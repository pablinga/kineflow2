import "server-only";

import crypto from "node:crypto";
import { notifyProfessional } from "@/lib/deposit-emails";
import { MERCADOPAGO_API_URL } from "@/lib/mercadopago";
import { getSiteUrl } from "@/lib/site-url";
import {
  MercadoPagoOAuthError,
  type MercadoPagoOAuthToken,
  needsRefresh,
  requestOAuthToken,
  tokenExpiresAt,
} from "@/lib/mercadopago-oauth";
import type { getSupabaseAdminClient } from "@/lib/supabase-server";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "@/lib/token-crypto";

// Conexiones OAuth de Mercado Pago de cada profesional. Los tokens solo se
// descifran acá, en el servidor; nunca salen hacia el navegador.

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type MpConnectionRow = {
  access_token_encrypted: string;
  expires_at: string | null;
  id: string;
  live_mode: boolean;
  mp_user_id: string;
  professional_id: string;
  refresh_token_encrypted: string | null;
  status: "active" | "expired" | "revoked" | "error";
};

const CONNECTION_COLUMNS =
  "id, professional_id, mp_user_id, access_token_encrypted, refresh_token_encrypted, live_mode, expires_at, status";

export function getMercadoPagoOAuthConfig() {
  const clientId = process.env.MP_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.MP_OAUTH_CLIENT_SECRET?.trim();
  const encryptionKey = parseEncryptionKey(process.env.MP_TOKEN_ENCRYPTION_KEY);

  if (!clientId || !clientSecret || !encryptionKey) {
    return null;
  }

  return {
    apiUrl: MERCADOPAGO_API_URL,
    clientId,
    clientSecret,
    encryptionKey,
    redirectUri: `${getSiteUrl()}/api/mercadopago/oauth/callback`,
    // Clave del state derivada de la de cifrado (una variable menos).
    stateSecret: crypto
      .createHmac("sha256", encryptionKey)
      .update("kineflow-mp-oauth-state")
      .digest("base64url"),
  };
}

export type MercadoPagoOAuthConfig = NonNullable<ReturnType<typeof getMercadoPagoOAuthConfig>>;

export async function saveConnectionFromToken(params: {
  admin: SupabaseAdminClient;
  config: MercadoPagoOAuthConfig;
  professionalId: string;
  token: MercadoPagoOAuthToken;
}) {
  const now = new Date().toISOString();
  const { error } = await params.admin.from("mp_connections").upsert(
    {
      access_token_encrypted: encryptSecret(params.token.access_token, params.config.encryptionKey),
      connected_at: now,
      expires_at: tokenExpiresAt(params.token),
      last_error: null,
      last_refresh_at: now,
      live_mode: params.token.live_mode ?? false,
      mp_user_id: String(params.token.user_id),
      professional_id: params.professionalId,
      refresh_token_encrypted: params.token.refresh_token
        ? encryptSecret(params.token.refresh_token, params.config.encryptionKey)
        : null,
      status: "active",
      updated_at: now,
    },
    { onConflict: "professional_id" },
  );

  if (error) {
    throw new Error("No pudimos guardar la conexión con Mercado Pago.");
  }
}

async function markConnection(
  admin: SupabaseAdminClient,
  row: MpConnectionRow,
  status: MpConnectionRow["status"],
  lastError: string,
) {
  await admin
    .from("mp_connections")
    .update({ last_error: lastError.slice(0, 500), status, updated_at: new Date().toISOString() })
    .eq("id", row.id);
}

/**
 * Renueva el token con el refresh_token. invalid_grant = el profesional
 * desvinculó la app: queda 'revoked'. Otro error: si el token todavía no
 * venció se reintenta en el próximo cron; si venció queda 'expired'. En los
 * dos casos finales se avisa por mail una sola vez (al cambiar de estado).
 */
export async function refreshConnection(
  admin: SupabaseAdminClient,
  config: MercadoPagoOAuthConfig,
  row: MpConnectionRow,
  fetchImpl?: typeof fetch,
) {
  const refreshToken = row.refresh_token_encrypted
    ? decryptSecret(row.refresh_token_encrypted, config.encryptionKey)
    : null;

  try {
    if (!refreshToken) {
      throw new MercadoPagoOAuthError("Sin refresh_token.", "invalid_grant", 400);
    }

    const token = await requestOAuthToken({
      apiUrl: config.apiUrl,
      body: { grant_type: "refresh_token", refresh_token: refreshToken },
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      fetchImpl,
    });

    await saveConnectionFromToken({ admin, config, professionalId: row.professional_id, token });
    return { ok: true as const, accessToken: token.access_token };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al renovar el token.";
    const revoked = error instanceof MercadoPagoOAuthError && error.code === "invalid_grant";
    const expired = row.expires_at ? new Date(row.expires_at).getTime() <= Date.now() : false;

    if (revoked || expired) {
      await markConnection(admin, row, revoked ? "revoked" : "expired", message);
      await notifyProfessional(admin, row.professional_id, revoked ? "mp_disconnected" : "mp_refresh_failed");
    } else {
      await admin
        .from("mp_connections")
        .update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }

    console.error("[mp-connections] refresh failed", {
      connectionId: row.id,
      revoked,
      status: error instanceof MercadoPagoOAuthError ? error.status : null,
    });
    return { ok: false as const, reason: revoked ? "revoked" : expired ? "expired" : "refresh_failed" };
  }
}

export type SellerCredentials = { accessToken: string; connectionId: string; mpUserId: string };

/**
 * Token para cobrar en nombre del profesional. null si no conectó Mercado
 * Pago o la conexión no sirve (vencida, revocada, no se puede descifrar).
 */
export async function getSellerCredentials(
  admin: SupabaseAdminClient,
  professionalId: string,
): Promise<SellerCredentials | null> {
  const config = getMercadoPagoOAuthConfig();

  if (!config) {
    return null;
  }

  const { data } = await admin
    .from("mp_connections")
    .select(CONNECTION_COLUMNS)
    .eq("professional_id", professionalId)
    .eq("status", "active")
    .maybeSingle();
  const row = data as MpConnectionRow | null;

  if (!row) {
    return null;
  }

  return credentialsFromRow(admin, config, row);
}

/** Igual que getSellerCredentials, buscando por el user_id de Mercado Pago (webhook). */
export async function getSellerCredentialsByMpUserId(
  admin: SupabaseAdminClient,
  mpUserId: string,
): Promise<(SellerCredentials & { professionalId: string }) | null> {
  const config = getMercadoPagoOAuthConfig();

  if (!config) {
    return null;
  }

  const { data } = await admin
    .from("mp_connections")
    .select(CONNECTION_COLUMNS)
    .eq("mp_user_id", mpUserId)
    .eq("status", "active")
    .maybeSingle();
  const row = data as MpConnectionRow | null;

  if (!row) {
    return null;
  }

  const credentials = await credentialsFromRow(admin, config, row);
  return credentials ? { ...credentials, professionalId: row.professional_id } : null;
}

async function credentialsFromRow(
  admin: SupabaseAdminClient,
  config: MercadoPagoOAuthConfig,
  row: MpConnectionRow,
): Promise<SellerCredentials | null> {
  if (needsRefresh(row.expires_at)) {
    const refreshed = await refreshConnection(admin, config, row);

    if (refreshed.ok) {
      return { accessToken: refreshed.accessToken, connectionId: row.id, mpUserId: row.mp_user_id };
    }

    // Si todavía no venció, se sigue usando el token actual.
    if (refreshed.reason !== "refresh_failed") {
      return null;
    }
  }

  const accessToken = decryptSecret(row.access_token_encrypted, config.encryptionKey);

  if (!accessToken) {
    await markConnection(admin, row, "error", "No se pudo descifrar el token.");
    await notifyProfessional(admin, row.professional_id, "mp_refresh_failed");
    return null;
  }

  return { accessToken, connectionId: row.id, mpUserId: row.mp_user_id };
}

/** Un 401 de la API con un token que creíamos válido: la conexión se cae. */
export async function markConnectionUnauthorized(
  admin: SupabaseAdminClient,
  connectionId: string,
) {
  const { data } = await admin
    .from("mp_connections")
    .select(CONNECTION_COLUMNS)
    .eq("id", connectionId)
    .maybeSingle();
  const row = data as MpConnectionRow | null;

  if (row?.status === "active") {
    await markConnection(admin, row, "revoked", "Mercado Pago rechazó el token (401).");
    await notifyProfessional(admin, row.professional_id, "mp_disconnected");
  }
}

/** Para el cron: conexiones activas que vencen pronto. */
export async function listConnectionsToRefresh(admin: SupabaseAdminClient, limit = 50) {
  const threshold = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await admin
    .from("mp_connections")
    .select(CONNECTION_COLUMNS)
    .eq("status", "active")
    .lt("expires_at", threshold)
    .order("expires_at", { ascending: true })
    .limit(limit);

  return (data ?? []) as MpConnectionRow[];
}
