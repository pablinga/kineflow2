import { NextResponse } from "next/server";
import { consumeApprovalToken } from "@/lib/content/server";

export const runtime = "nodejs";

/**
 * Ejecuta la acción del link del mail. Solo POST (el botón de la página de
 * confirmación): un GET nunca aprueba, así los previsualizadores de links de
 * los clientes de correo no aprueban solos.
 */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const token = typeof form?.get("t") === "string" ? String(form?.get("t")) : "";
  const base = new URL("/contenido/aprobacion", request.url);

  if (!token) {
    base.searchParams.set("resultado", "invalid");
    return NextResponse.redirect(base, 303);
  }

  try {
    const result = await consumeApprovalToken(token);
    base.searchParams.set("resultado", result.ok ? (result.action === "approve" ? "aprobado" : "rechazado") : result.reason);
  } catch (error) {
    console.error("[content] aprobación por mail", error);
    base.searchParams.set("resultado", "error");
  }

  return NextResponse.redirect(base, 303);
}
