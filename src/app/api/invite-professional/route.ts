import { NextRequest, NextResponse } from "next/server";
import { renderKineflowEmail } from "@/lib/email-templates";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type InvitePayload = {
  clinicName?: string;
  email?: string;
  token?: string;
};

function getAppUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`
  );
}

function buildInvitationBody(params: {
  clinicName: string;
  invitationUrl: string;
}) {
  return [
    `Te invitaron a unirte a ${params.clinicName} en KineFlow.`,
    "",
    "Al aceptar la invitación vas a poder trabajar con la clínica desde tu cuenta de kinesiólogo.",
    "",
    `Aceptar invitación: ${params.invitationUrl}`,
    "",
    "Si no esperabas esta invitación, podés ignorar este correo.",
  ].join("\n");
}

function buildInvitationHtml(params: {
  clinicName: string;
  invitationUrl: string;
}) {
  return renderKineflowEmail({
    ctaLabel: "Aceptar invitación",
    ctaUrl: params.invitationUrl,
    footnote: "Si no esperabas esta invitación, podés ignorar este correo.",
    highlights: [
      { icon: "📅", text: "Ver en tu agenda los turnos que te asigne la clínica" },
      { icon: "✅", text: "Registrar asistencia y evoluciones de sus pacientes" },
      { icon: "🏠", text: "Seguir usando tu espacio particular como siempre" },
    ],
    highlightsTitle: "¿Qué vas a poder hacer?",
    icon: "🤝",
    paragraphs: [
      `**${params.clinicName}** te invitó a sumarte a su equipo en KineFlow.`,
      "Si todavía no tenés cuenta, creala con este mismo email y vas a ver la invitación al ingresar.",
    ],
    title: "Te invitaron a una clínica",
  });
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as InvitePayload;
    const token = payload.token?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "Faltan datos para enviar la invitacion." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authorization = request.headers.get("authorization");

    if (!supabaseUrl || !supabaseAnonKey || !authorization) {
      return NextResponse.json(
        { error: "No pudimos validar la sesion." },
        { status: 401 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "No pudimos validar la sesion." },
        { status: 401 },
      );
    }

    const admin = getSupabaseAdminClient();

    if (!admin) {
      return NextResponse.json(
        { error: "No pudimos enviar la invitacion." },
        { status: 500 },
      );
    }

    // Solo el dueño o un admin de la clínica puede mandar la invitación, y el
    // email y el nombre de la clínica salen de la invitación guardada (no del
    // body), para que no se puedan usar para mandar mails arbitrarios.
    const { data: invitation } = await admin
      .from("clinic_professionals")
      .select("clinic_id, professional_email, clinics(name)")
      .eq("id", token)
      .maybeSingle();
    const invitationRow = invitation as {
      clinic_id: string;
      clinics: { name: string } | Array<{ name: string }> | null;
      professional_email: string;
    } | null;

    if (!invitationRow) {
      return NextResponse.json(
        { error: "No encontramos la invitacion." },
        { status: 404 },
      );
    }

    const { data: workspaceId } = await admin.rpc("get_clinic_workspace_id", {
      target_clinic_id: invitationRow.clinic_id,
    });
    const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("is_clinic_owner", { target_clinic_id: invitationRow.clinic_id }),
      workspaceId
        ? supabase.rpc("is_workspace_admin", { target_workspace_id: workspaceId })
        : Promise.resolve({ data: false }),
    ]);

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "No tenés permisos para invitar profesionales a esta clínica." },
        { status: 403 },
      );
    }

    const clinic = Array.isArray(invitationRow.clinics)
      ? invitationRow.clinics[0]
      : invitationRow.clinics;
    const email = invitationRow.professional_email.trim().toLowerCase();
    const clinicName = clinic?.name?.trim() || payload.clinicName?.trim() || "la clínica";

    const invitationUrl = `${getAppUrl(request)}/invitacion?token=${token}`;
    const subject = `Te invitaron a unirte a ${clinicName} en KineFlow`;
    const text = buildInvitationBody({ clinicName, invitationUrl });
    const html = buildInvitationHtml({ clinicName, invitationUrl });
    const resendApiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM_EMAIL || "KineFlow <notificaciones@mail.kineflow.ar>";

    if (!resendApiKey) {
      console.log("invite-professional email prepared", {
        subject,
        text,
        to: email,
      });

      return NextResponse.json({ sent: false, skipped: true });
    }

    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from,
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
      const details = await response.text();
      console.error("invite-professional resend failed", details);

      return NextResponse.json(
        { error: "No pudimos enviar la invitacion por email." },
        { status: 502 },
      );
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("invite-professional failed", error);

    return NextResponse.json(
      { error: "No pudimos enviar la invitacion." },
      { status: 500 },
    );
  }
}
