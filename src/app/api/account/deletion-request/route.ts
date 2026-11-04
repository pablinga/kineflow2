import { NextResponse } from "next/server";
import {
  buildDeletionConfirmationText,
  buildDeletionRequestText,
  getAccountDeletionInbox,
  normalizeDeletionReason,
} from "@/lib/account-deletion";
import { escapeHtml } from "@/lib/email-templates";
import { sendResendEmail } from "@/lib/resend";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

function textToHtml(text: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
}

/**
 * Pedido de eliminación de cuenta desde la app (Configuración → General).
 * No borra nada: avisa a KineFlow por mail y le confirma el pedido al usuario.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "Necesitás iniciar sesión." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Falta configurar el servidor." }, { status: 500 });
  }

  const {
    data: { user },
    error: userError,
  } = await getSupabaseServerClient(token).auth.getUser(token);

  if (userError || !user?.email) {
    return NextResponse.json({ error: "No pudimos validar tu sesión." }, { status: 401 });
  }

  let reason = "";

  try {
    const body = (await request.json()) as { reason?: unknown };
    reason = normalizeDeletionReason(body.reason);
  } catch {
    // Sin cuerpo o JSON inválido: el motivo es opcional.
  }

  const [{ data: profile }, { data: workspaces }, { data: subscription }] = await Promise.all([
    admin.from("profiles").select("full_name, account_type").eq("id", user.id).maybeSingle(),
    admin.from("workspaces").select("name, type").eq("owner_id", user.id),
    admin
      .from("subscriptions")
      .select("status")
      .eq("account_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const fullName = (profile as { full_name?: string | null } | null)?.full_name?.trim() ?? "";
  const inbox = getAccountDeletionInbox();
  const internalText = buildDeletionRequestText({
    accountType: (profile as { account_type?: string | null } | null)?.account_type ?? "",
    email: user.email,
    fullName,
    ownedWorkspaces: ((workspaces ?? []) as Array<{ name: string | null; type: string | null }>).map(
      (workspace) => ({ name: workspace.name ?? "(sin nombre)", type: workspace.type ?? "" }),
    ),
    reason,
    requestedAt: new Date().toISOString(),
    subscriptionStatus: (subscription as { status?: string | null } | null)?.status ?? "",
    userId: user.id,
  });

  const internal = await sendResendEmail({
    html: textToHtml(internalText),
    logTag: "account:deletion-request",
    subject: "Pedido de eliminación de cuenta",
    text: internalText,
    to: inbox,
  });

  if (!internal.sent) {
    return NextResponse.json(
      {
        error: `No pudimos enviar el pedido. Escribinos a ${inbox} con el asunto "Eliminar mi cuenta".`,
      },
      { status: 503 },
    );
  }

  const confirmationText = buildDeletionConfirmationText({ fullName, inbox });
  // Si la confirmación no sale, el pedido igual llegó: no se informa error.
  await sendResendEmail({
    html: textToHtml(confirmationText),
    logTag: "account:deletion-confirmation",
    subject: "Recibimos tu pedido para eliminar tu cuenta de KineFlow",
    text: confirmationText,
    to: user.email,
  });

  return NextResponse.json({ ok: true });
}
