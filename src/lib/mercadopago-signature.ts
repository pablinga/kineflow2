/**
 * Validación del header x-signature de los webhooks de Mercado Pago. Lógica
 * pura (solo node:crypto) para poder testearla sin levantar el servidor.
 *
 * Mercado Pago firma con HMAC-SHA256 (clave secreta del webhook) el manifest
 * `id:[data.id];request-id:[x-request-id];ts:[ts];`, omitiendo las partes que
 * no vienen en la notificación. El header llega como `ts=...,v1=...`.
 */
import crypto from "node:crypto";

/** Diferencia máxima entre el ts de la firma y la hora del servidor. */
export const MERCADOPAGO_SIGNATURE_TOLERANCE_MS = 10 * 60 * 1000;

export type MercadoPagoSignatureFailure =
  | "missing_secret"
  | "missing_signature"
  | "malformed_signature"
  | "timestamp_out_of_range"
  | "signature_mismatch";

export type MercadoPagoSignatureResult =
  | { valid: true }
  | { reason: MercadoPagoSignatureFailure; valid: false };

function getSignaturePart(signature: string, key: string) {
  return signature
    .split(",")
    .map((part) => part.trim().split("="))
    .find(([partKey]) => partKey?.trim() === key)?.[1]
    ?.trim();
}

/** ts en milisegundos (formato actual de Mercado Pago); se aceptan segundos. */
export function parseMercadoPagoSignatureTimestamp(ts: string) {
  if (!/^\d{1,16}$/.test(ts)) {
    return null;
  }

  const value = Number(ts);
  return value < 1e12 ? value * 1000 : value;
}

export function buildMercadoPagoSignatureManifest(params: {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}) {
  // Mercado Pago pide el data.id en minúsculas cuando es alfanumérico.
  const idPart = params.dataId ? `id:${params.dataId.toLowerCase()};` : "";
  const requestIdPart = params.requestId ? `request-id:${params.requestId};` : "";

  return `${idPart}${requestIdPart}ts:${params.ts};`;
}

export function verifyMercadoPagoSignature(params: {
  /** data.id del query string de la notificación (o del body si no viene). */
  dataId: string | null;
  now?: number;
  requestId: string | null;
  secret: string | null | undefined;
  signature: string | null;
  toleranceMs?: number;
}): MercadoPagoSignatureResult {
  const secret = params.secret?.trim();

  if (!secret) {
    return { reason: "missing_secret", valid: false };
  }

  if (!params.signature) {
    return { reason: "missing_signature", valid: false };
  }

  const ts = getSignaturePart(params.signature, "ts");
  const hash = getSignaturePart(params.signature, "v1");
  const timestampMs = ts ? parseMercadoPagoSignatureTimestamp(ts) : null;

  if (!ts || !hash || timestampMs === null || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { reason: "malformed_signature", valid: false };
  }

  const now = params.now ?? Date.now();
  const tolerance = params.toleranceMs ?? MERCADOPAGO_SIGNATURE_TOLERANCE_MS;

  if (Math.abs(now - timestampMs) > tolerance) {
    return { reason: "timestamp_out_of_range", valid: false };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(
      buildMercadoPagoSignatureManifest({
        dataId: params.dataId,
        requestId: params.requestId,
        ts,
      }),
    )
    .digest();
  const received = Buffer.from(hash, "hex");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
    ? { valid: true }
    : { reason: "signature_mismatch", valid: false };
}
