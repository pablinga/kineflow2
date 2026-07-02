import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    "Al aceptar la invitacion vas a poder trabajar con la clinica desde tu cuenta de kinesiologo.",
    "",
    `Aceptar invitacion: ${params.invitationUrl}`,
    "",
    "Si no esperabas esta invitacion, podes ignorar este correo.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as InvitePayload;
    const email = payload.email?.trim().toLowerCase();
    const clinicName = payload.clinicName?.trim();
    const token = payload.token?.trim();

    if (!email || !clinicName || !token) {
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

    const invitationUrl = `${getAppUrl(request)}/invitacion?token=${token}`;
    const subject = `Te invitaron a unirte a ${clinicName} en KineFlow`;
    const text = buildInvitationBody({ clinicName, invitationUrl });
    const resendApiKey = process.env.RESEND_API_KEY;
    const from =
      process.env.RESEND_FROM_EMAIL || "KineFlow <notificaciones@kineflow.ar>";

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
