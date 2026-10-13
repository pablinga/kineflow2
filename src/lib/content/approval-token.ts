import { createHmac, timingSafeEqual } from "node:crypto";

// Links de aprobación por mail. El token lleva el id de la fila de
// content_approval_links (que marca el uso único), el post, la acción y el
// vencimiento, firmados con HMAC-SHA256 (CONTENT_APPROVAL_SECRET).

export type ApprovalAction = "approve" | "reject";

export type ApprovalTokenPayload = {
  action: ApprovalAction;
  contentId: string;
  /** Vencimiento en segundos (epoch). */
  exp: number;
  linkId: string;
};

export type ApprovalTokenResult =
  | { ok: true; payload: ApprovalTokenPayload }
  | { ok: false; reason: "invalid" | "expired" };

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function createApprovalToken(payload: ApprovalTokenPayload, secret: string) {
  if (secret.length < 32) {
    throw new Error("CONTENT_APPROVAL_SECRET tiene que tener al menos 32 caracteres.");
  }

  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${data}.${sign(data, secret)}`;
}

export function verifyApprovalToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): ApprovalTokenResult {
  const [data, signature, extra] = token.split(".");

  if (!data || !signature || extra !== undefined || secret.length < 32) {
    return { ok: false, reason: "invalid" };
  }

  const expected = Buffer.from(sign(data, secret));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "invalid" };
  }

  let payload: ApprovalTokenPayload;

  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (
    (payload.action !== "approve" && payload.action !== "reject") ||
    typeof payload.contentId !== "string" ||
    typeof payload.linkId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "invalid" };
  }

  if (payload.exp * 1000 <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload };
}
