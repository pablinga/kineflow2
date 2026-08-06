import { NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type AppointmentStatus = "pending" | "attended" | "cancelled" | "no_show" | "rescheduled";

type AppointmentRow = {
  id: string;
  owner_id: string;
  patient_id: string;
  session_number: number | null;
  status: AppointmentStatus | "confirmed" | "completed";
  treatment_id: string | null;
  workspace_id: string | null;
};

type TreatmentRow = {
  id: string;
  status: string;
  total_sessions: number;
  used_sessions: number;
};

function isAttendedStatus(status: string) {
  return status === "attended" || status === "completed";
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitás iniciar sesión." },
      { status: 401 },
    );
  }

  const { appointmentId, status } = (await request.json()) as {
    appointmentId?: string;
    status?: AppointmentStatus;
  };

  if (!appointmentId || !status) {
    return NextResponse.json(
      { error: "Faltan datos para actualizar el turno." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient(token);
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin no está configurado." },
      { status: 500 },
    );
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json(
      { error: "No pudimos validar tu sesión." },
      { status: 401 },
    );
  }

  const { data: appointment, error: appointmentError } = await admin
    .from("appointments")
    .select("id, owner_id, patient_id, status, treatment_id, session_number, workspace_id")
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return NextResponse.json(
      { error: "No encontramos el turno." },
      { status: 404 },
    );
  }

  const currentAppointment = appointment as AppointmentRow;
  const { data: membership } = currentAppointment.workspace_id
    ? await admin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", currentAppointment.workspace_id)
        .eq("user_id", user.id)
        .eq("status", "accepted")
        .maybeSingle()
    : { data: null };
  const canUpdateAppointment =
    currentAppointment.owner_id === user.id ||
    (membership as { role?: string } | null)?.role === "ADMIN";

  if (!canUpdateAppointment) {
    return NextResponse.json(
      { error: "No tenés permisos para actualizar este turno." },
      { status: 403 },
    );
  }

  let treatmentCompleted: { totalSessions: number } | null = null;

  if (currentAppointment.treatment_id) {
    const { data: treatment } = await admin
        .from("treatments")
        .select("id, status, total_sessions, used_sessions")
        .eq("id", currentAppointment.treatment_id)
        .maybeSingle();

    if (treatment) {
      const currentTreatment = treatment as TreatmentRow;
      const wasAttended = isAttendedStatus(currentAppointment.status);
      const willAttend = status === "attended";
      let usedSessions = currentTreatment.used_sessions ?? 0;
      let nextSessionNumber = currentAppointment.session_number;

      if (!wasAttended && willAttend) {
        usedSessions += 1;
        nextSessionNumber = nextSessionNumber ?? usedSessions;
      }

      if (wasAttended && !willAttend) {
        usedSessions = Math.max(0, usedSessions - 1);
        nextSessionNumber = null;
      }

      const completed = usedSessions >= currentTreatment.total_sessions;
      const nextTreatmentStatus = completed
        ? "FINALIZADO"
        : currentTreatment.status === "FINALIZADO"
          ? "EN_CURSO"
          : currentTreatment.status;

      const { error: treatmentError } = await admin
        .from("treatments")
        .update({
          ended_at: completed ? new Date().toISOString().slice(0, 10) : null,
          status: nextTreatmentStatus,
          used_sessions: usedSessions,
        })
        .eq("id", currentTreatment.id)
        .eq("workspace_id", currentAppointment.workspace_id);

      if (treatmentError) {
        return NextResponse.json(
          { error: "No pudimos actualizar el tratamiento." },
          { status: 500 },
        );
      }

      currentAppointment.session_number = nextSessionNumber;

      if (completed && !wasAttended && willAttend) {
        treatmentCompleted = { totalSessions: currentTreatment.total_sessions };
      }
    }
  }

  const { error: updateError } = await admin
    .from("appointments")
    .update({
      session_number: currentAppointment.session_number,
      status,
    })
    .eq("id", appointmentId);

  if (updateError) {
    return NextResponse.json(
      { error: "No pudimos actualizar el turno." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, treatmentCompleted });
}

