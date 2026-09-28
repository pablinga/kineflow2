import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * Acceso al panel admin de la plataforma (/admin). Es independiente de las
 * cuentas de KineFlow: usuario y hash de contraseña en variables de entorno.
 *
 * - ADMIN_USERNAME
 * - ADMIN_PASSWORD_HASH: generado con `node scripts/admin-password-hash.mjs`
 * - ADMIN_SESSION_SECRET: string aleatorio largo para firmar la cookie
 *
 * Si falta alguna, el panel queda desactivado (responde 404).
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

export const ADMIN_SESSION_COOKIE = "kf_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const FAILED_ATTEMPTS_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS_PER_IP = 5;
// Tope global contra intentos distribuidos desde muchas IPs.
const MAX_FAILED_ATTEMPTS_GLOBAL = 50;

type AdminConfig = {
  passwordHash: string;
  sessionSecret: string;
  username: string;
};

function getAdminConfig(): AdminConfig | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const passwordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim();

  if (!username || !passwordHash || !sessionSecret || sessionSecret.length < 32) {
    return null;
  }

  return { passwordHash, sessionSecret, username };
}

export function isAdminPanelEnabled() {
  return getAdminConfig() !== null;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  // Comparar siempre contra el mismo largo para no filtrar información por tiempo.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }

  return timingSafeEqual(left, right);
}

/** Formato: scrypt:<salt base64url>:<hash base64url> */
async function verifyPassword(password: string, storedHash: string) {
  const [scheme, saltValue, hashValue] = storedHash.split(":");

  if (scheme !== "scrypt" || !saltValue || !hashValue) {
    return false;
  }

  const expected = Buffer.from(hashValue, "base64url");
  const actual = await scryptAsync(
    password,
    Buffer.from(saltValue, "base64url"),
    expected.length,
  );

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signSession(config: AdminConfig, expiresAt: number, nonce: string) {
  // Incluye el hash de la contraseña: cambiarla invalida las sesiones abiertas.
  return createHmac("sha256", config.sessionSecret)
    .update(`v1.${expiresAt}.${nonce}.${config.username}.${config.passwordHash}`)
    .digest("base64url");
}

function createSessionToken(config: AdminConfig) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const nonce = randomBytes(16).toString("base64url");

  return `v1.${expiresAt}.${nonce}.${signSession(config, expiresAt, nonce)}`;
}

function isValidSessionToken(config: AdminConfig, token: string | undefined) {
  if (!token) {
    return false;
  }

  const [version, expiresAtValue, nonce, signature] = token.split(".");
  const expiresAt = Number(expiresAtValue);

  if (
    version !== "v1" ||
    !nonce ||
    !signature ||
    !Number.isFinite(expiresAt) ||
    expiresAt < Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  return safeEqual(signature, signSession(config, expiresAt, nonce));
}

/** Para server components y route handlers del panel. */
export async function hasAdminSession() {
  const config = getAdminConfig();

  if (!config) {
    return false;
  }

  const cookieStore = await cookies();

  return isValidSessionToken(config, cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export function getAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

type LoginResult =
  | { ok: true; token: string }
  | { ok: false; reason: "disabled" | "invalid" | "locked" | "unavailable" };

export async function attemptAdminLogin(
  username: string,
  password: string,
  ip: string,
): Promise<LoginResult> {
  const config = getAdminConfig();
  const admin = getSupabaseAdminClient();

  if (!config) {
    return { ok: false, reason: "disabled" };
  }

  // Sin base no se puede aplicar el bloqueo: mejor no dejar entrar.
  if (!admin) {
    return { ok: false, reason: "unavailable" };
  }

  const since = new Date(
    Date.now() - FAILED_ATTEMPTS_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
  const [ipAttempts, globalAttempts] = await Promise.all([
    admin
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("success", false)
      .gte("attempted_at", since),
    admin
      .from("admin_login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("success", false)
      .gte("attempted_at", since),
  ]);

  if (ipAttempts.error || globalAttempts.error) {
    return { ok: false, reason: "unavailable" };
  }

  if (
    (ipAttempts.count ?? 0) >= MAX_FAILED_ATTEMPTS_PER_IP ||
    (globalAttempts.count ?? 0) >= MAX_FAILED_ATTEMPTS_GLOBAL
  ) {
    return { ok: false, reason: "locked" };
  }

  // Verificar la contraseña siempre, aunque el usuario no coincida, para que
  // el tiempo de respuesta no indique cuál de los dos está mal.
  const passwordOk = await verifyPassword(password, config.passwordHash);
  const success = safeEqual(username.trim(), config.username) && passwordOk;

  await admin.from("admin_login_attempts").insert({ ip, success });

  if (!success) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, token: createSessionToken(config) };
}
