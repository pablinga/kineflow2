import { NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type AppointmentStatus = "pending" | "attended" | "cancelled" | "no_show" | "rescheduled";

type AppointmentRow = {
  appointment_origin: string | null;
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
    .select("id, owner_id, patient_id, status, treatment_id, session_number, workspace_id, appointment_origin")
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
  const isWorkspaceAdmin =
    (membership as { role?: string } | null)?.role === "ADMIN";
  const canUpdateAppointment =
    currentAppointment.owner_id === user.id || isWorkspaceAdmin;

  if (!canUpdateAppointment) {
    return NextResponse.json(
      { error: "No tenés permisos para actualizar este turno." },
      { status: 403 },
    );
  }

  // En un turno de clínica, el profesional asignado solo registra asistencia;
  // cancelarlo o cambiarlo a otro estado le corresponde a la clínica.
  if (
    currentAppointment.appointment_origin === "clinic" &&
    !isWorkspaceAdmin &&
    status !== "attended" &&
    status !== "no_show"
  ) {
    return NextResponse.json(
      { error: "Este turno lo gestiona la clínica: solo podés registrar la asistencia." },
      { status: 403 },
    );
  }

  let treatmentCompleted: { totalSessions: number } | null = null;
  let treatmentUpdate: {
    completed: boolean;
    id: string;
    status: string;
    usedSessions: number;
  } | null = null;

  // Se calcula antes, pero el tratamiento se actualiza recién cuando el turno
  // se guardó bien: si no, un turno rechazado sumaba igual la sesión.
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

      treatmentUpdate = {
        completed,
        id: currentTreatment.id,
        status: completed
          ? "FINALIZADO"
          : currentTreatment.status === "FINALIZADO"
            ? "EN_CURSO"
            : currentTreatment.status,
        usedSessions,
      };
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
    console.error("appointment status update failed", updateError);

    // P0001 = raise exception de nuestros triggers, con mensaje ya pensado
    // para el usuario (horario reservado, cuenta en solo lectura, etc.).
    return NextResponse.json(
      {
        error:
          updateError.code === "P0001" && updateError.message
            ? updateError.message
            : "No pudimos actualizar el turno.",
      },
      { status: updateError.code === "P0001" ? 409 : 500 },
    );
  }

  if (treatmentUpdate) {
    const { error: treatmentError } = await admin
      .from("treatments")
      .update({
        ended_at: treatmentUpdate.completed
          ? new Date().toISOString().slice(0, 10)
          : null,
        status: treatmentUpdate.status,
        used_sessions: treatmentUpdate.usedSessions,
      })
      .eq("id", treatmentUpdate.id)
      .eq("workspace_id", currentAppointment.workspace_id);

    if (treatmentError) {
      console.error("appointment status treatment update failed", treatmentError);
      return NextResponse.json(
        { error: "Actualizamos el turno, pero no pudimos actualizar el tratamiento." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, treatmentCompleted });
}

