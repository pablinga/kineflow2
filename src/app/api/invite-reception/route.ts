import { NextRequest, NextResponse } from "next/server";
import { renderKineflowEmail } from "@/lib/email-templates";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type InviteReceptionPayload = {
  email?: string;
  workspaceId?: string;
};

type MemberRow = {
  id: string;
  role: string;
  status: string;
};

function getAppUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  );
}

function buildInvitationHtml(params: { clinicName: string; dashboardUrl: string }) {
  return renderKineflowEmail({
    ctaLabel: "Ingresar a KineFlow",
    ctaUrl: params.dashboardUrl,
    footnote: "Si no esperabas esta invitación, podés ignorar este correo.",
    highlights: [
      { icon: "👥", text: "Gestionar los pacientes de la clínica" },
      { icon: "📅", text: "Organizar la agenda y los turnos" },
      { icon: "💰", text: "Registrar asistencia y cobros" },
    ],
    highlightsTitle: "¿Qué vas a poder hacer?",
    icon: "🤝",
    paragraphs: [
      `**${params.clinicName}** te invitó a sumarte como recepción en KineFlow.`,
      "Ingresá (o creá tu cuenta con este mismo email) y aceptá la invitación desde el inicio.",
    ],
    title: "Te invitaron como recepción",
  });
}

function buildInvitationBody(params: { clinicName: string; dashboardUrl: string }) {
  return [
    `Te invitaron a sumarte como recepción de ${params.clinicName} en KineFlow.`,
    "",
    "Vas a poder gestionar los pacientes y la agenda de la clínica.",
    "",
    `Ingresá (o creá tu cuenta con este mismo email) y aceptá la invitación desde el inicio: ${params.dashboardUrl}`,
    "",
    "Si no esperabas esta invitación, podés ignorar este correo.",
  ].join("\n");
}

/**
 * Un admin de la clínica invita a alguien como RECEPCION: crea (o reutiliza)
 * la fila pendiente en workspace_members y manda el aviso por email. No pasa
 * por clinic_professionals: recepción no es profesional.
 */
export async function POST(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const supabase = getSupabaseServerClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return NextResponse.json({ error: "No pudimos validar la sesión." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as InviteReceptionPayload | null;
  const email = payload?.email?.trim().toLowerCase() ?? "";
  const workspaceId = payload?.workspaceId?.trim() ?? "";

  if (!workspaceId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Ingresá un email válido." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "No pudimos enviar la invitación." }, { status: 500 });
  }

  const [{ data: isAdmin }, { data: workspace }] = await Promise.all([
    supabase.rpc("is_workspace_admin", { target_workspace_id: workspaceId }),
    admin.from("workspaces").select("name, type").eq("id", workspaceId).maybeSingle(),
  ]);
  const workspaceRow = workspace as { name: string; type: string } | null;

  if (!isAdmin || workspaceRow?.type !== "CLINICA") {
    return NextResponse.json(
      { error: "Solo un administrador de la clínica puede invitar a recepción." },
      { status: 403 },
    );
  }

  const { data: existingData, error: existingError } = await admin
    .from("workspace_members")
    .select("id, role, status")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .in("status", ["pending", "accepted"]);

  if (existingError) {
    console.error("invite-reception lookup failed", existingError);
    return NextResponse.json({ error: "No pudimos enviar la invitación." }, { status: 500 });
  }

  const existing = (existingData ?? []) as MemberRow[];
  const pendingReception = existing.find(
    (member) => member.role === "RECEPCION" && member.status === "pending",
  );

  if (!pendingReception && existing.length > 0) {
    return NextResponse.json(
      { error: "Esa persona ya forma parte del equipo de la clínica." },
      { status: 409 },
    );
  }

  if (!pendingReception) {
    const { error: insertError } = await admin.from("workspace_members").insert({
      email,
      invited_by: userData.user.id,
      role: "RECEPCION",
      status: "pending",
      workspace_id: workspaceId,
    });

    if (insertError) {
      console.error("invite-reception insert failed", insertError);
      return NextResponse.json(
        {
          error:
            insertError.code === "23505"
              ? "Esa persona ya forma parte del equipo de la clínica."
              : "No pudimos crear la invitación.",
        },
        { status: insertError.code === "23505" ? 409 : 500 },
      );
    }
  }

  const clinicName = workspaceRow.name?.trim() || "la clínica";
  const subject = `Te invitaron como recepción de ${clinicName} en KineFlow`;
  const dashboardUrl = `${getAppUrl(request)}/dashboard`;
  const text = buildInvitationBody({ clinicName, dashboardUrl });
  const html = buildInvitationHtml({ clinicName, dashboardUrl });
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.log("invite-reception email prepared", { subject, text, to: email });
    return NextResponse.json({ sent: false, skipped: true });
  }

  const response = await fetch("https://api.resend.com/emails", {
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || "KineFlow <notificaciones@mail.kineflow.ar>",
      html,
      subject,
      text,
      to: email,
    }),
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    console.error("invite-reception resend failed", await response.text());
    return NextResponse.json(
      { error: "Creamos la invitación, pero no pudimos enviar el email." },
      { status: 502 },
    );
  }

  return NextResponse.json({ sent: true });
}
