/**
 * Cifrado de secretos guardados en la base (tokens OAuth de Mercado Pago de
 * cada profesional). AES-256-GCM con la clave MP_TOKEN_ENCRYPTION_KEY
 * (32 bytes en base64). Lógica pura (solo node:crypto) para poder testearla.
 *
 * Formato: "v1.<iv>.<tag>.<ciphertext>" en base64url. El prefijo de versión
 * permite rotar la clave o el algoritmo más adelante.
 */
import crypto from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

export function parseEncryptionKey(rawKey: string | null | undefined) {
  const value = rawKey?.trim();

  if (!value) {
    return null;
  }

  const key = Buffer.from(value, "base64");
  return key.length === 32 ? key : null;
}

export function encryptSecret(plaintext: string, key: Buffer) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** null si el texto no tiene el formato esperado o la clave no corresponde. */
export function decryptSecret(payload: string, key: Buffer) {
  const [version, iv, tag, ciphertext] = payload.split(".");

  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    return null;
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
