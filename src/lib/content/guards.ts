import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasAdminSession, isAdminPanelEnabled } from "@/lib/admin-auth";

// Accesos del publicador: sesión del panel admin (/admin, login propio),
// CRON_SECRET para los crons y CONTENT_AGENT_SECRET para el agente comercial.

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }

  return timingSafeEqual(left, right);
}

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";

  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

/** null si hay sesión admin; si no, la respuesta de error. */
export async function requireAdminApi() {
  if (!isAdminPanelEnabled()) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (!(await hasAdminSession())) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  return null;
}

export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  return Boolean(secret) && safeEqual(bearer(request), secret!);
}

export function isAgentRequest(request: Request) {
  const secret = process.env.CONTENT_AGENT_SECRET?.trim();

  return Boolean(secret && secret.length >= 32) && safeEqual(bearer(request), secret!);
}
