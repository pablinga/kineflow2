/**
 * OAuth de Mercado Pago (modelo marketplace): cada kinesiólogo autoriza a la
 * aplicación de KineFlow a cobrar en su nombre. Lógica pura (solo
 * node:crypto y fetch inyectable) para poder testearla.
 *
 * - state: "<payload base64url>.<firma>" con HMAC-SHA256. El payload lleva el
 *   usuario, un nonce (que además queda en una cookie httpOnly: el callback
 *   exige que coincidan, así el state no sirve en otro navegador) y el
 *   vencimiento.
 * - Los tokens de Mercado Pago duran 180 días; se refrescan antes con el
 *   refresh_token (ver REFRESH_BEFORE_DAYS).
 */
import crypto from "node:crypto";

export const MERCADOPAGO_AUTH_URL = "https://auth.mercadopago.com/authorization";
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;
export const OAUTH_NONCE_COOKIE = "kf_mp_oauth_nonce";
/** Se refresca el token cuando le quedan menos de estos días. */
export const REFRESH_BEFORE_DAYS = 30;

export type OAuthStatePayload = {
  exp: number;
  nonce: string;
  userId: string;
};

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createOAuthState(params: {
  now?: number;
  secret: string;
  userId: string;
}) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload: OAuthStatePayload = {
    exp: (params.now ?? Date.now()) + OAUTH_STATE_TTL_MS,
    nonce,
    userId: params.userId,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return { nonce, state: `${encoded}.${sign(encoded, params.secret)}` };
}

export type OAuthStateCheck =
  | { ok: true; userId: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "nonce_mismatch" };

export function verifyOAuthState(params: {
  cookieNonce: string | null | undefined;
  now?: number;
  secret: string;
  state: string | null | undefined;
}): OAuthStateCheck {
  const [encoded, signature] = (params.state ?? "").split(".");

  if (!encoded || !signature) {
    return { ok: false, reason: "malformed" };
  }

  const expected = Buffer.from(sign(encoded, params.secret));
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: OAuthStatePayload;

  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (typeof payload.userId !== "string" || typeof payload.nonce !== "string") {
    return { ok: false, reason: "malformed" };
  }

  if ((params.now ?? Date.now()) > payload.exp) {
    return { ok: false, reason: "expired" };
  }

  if (!params.cookieNonce || params.cookieNonce !== payload.nonce) {
    return { ok: false, reason: "nonce_mismatch" };
  }

  return { ok: true, userId: payload.userId };
}

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(MERCADOPAGO_AUTH_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", params.state);
  url.searchParams.set("redirect_uri", params.redirectUri);

  return url.toString();
}

export type MercadoPagoOAuthToken = {
  access_token: string;
  expires_in?: number;
  live_mode?: boolean;
  refresh_token?: string;
  user_id: number | string;
};

export class MercadoPagoOAuthError extends Error {
  /** invalid_grant = el refresh_token ya no sirve (desvinculó la app). */
  readonly code: string | null;
  readonly status: number;

  constructor(message: string, code: string | null, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Pide un token a /oauth/token (código de autorización o refresh). */
export async function requestOAuthToken(params: {
  apiUrl: string;
  body:
    | { code: string; grant_type: "authorization_code"; redirect_uri: string }
    | { grant_type: "refresh_token"; refresh_token: string };
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await (params.fetchImpl ?? fetch)(`${params.apiUrl}/oauth/token`, {
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      ...params.body,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const data = (await response.json().catch(() => ({}))) as Partial<MercadoPagoOAuthToken> & {
    error?: string;
    message?: string;
  };

  if (!response.ok || !data.access_token || data.user_id === undefined) {
    throw new MercadoPagoOAuthError(
      data.message ?? "Mercado Pago rechazó el pedido de token.",
      data.error ?? null,
      response.status,
    );
  }

  return data as MercadoPagoOAuthToken;
}

export function tokenExpiresAt(token: Pick<MercadoPagoOAuthToken, "expires_in">, now = Date.now()) {
  return token.expires_in ? new Date(now + token.expires_in * 1000).toISOString() : null;
}

export function needsRefresh(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) {
    return false;
  }

  return new Date(expiresAt).getTime() - now < REFRESH_BEFORE_DAYS * 24 * 60 * 60 * 1000;
}
