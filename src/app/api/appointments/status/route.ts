import { NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";
import { toArgentinaDateValue } from "@/lib/dates";
import { loadDepositSettings, refundDeposit } from "@/lib/deposit-payments";
import { type DepositStatus, decideCancellationRefund } from "@/lib/deposits";

type AppointmentStatus =
  | "pending"
  | "attended"
  | "cancelled"
  | "no_show"
  | "rescheduled"
  | "awaiting_payment";

type AppointmentRow = {
  appointment_origin: string | null;
  deposit_mp_payment_id: string | null;
  deposit_status: DepositStatus | null;
  scheduled_at: string;
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

  const { appointmentId, cancelledBy, status } = (await request.json()) as {
    appointmentId?: string;
    /** Quién cancela: define si se devuelve la seña (por defecto, el profesional). */
    cancelledBy?: "patient" | "professional";
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
    .select(
      "id, owner_id, patient_id, status, treatment_id, session_number, workspace_id, appointment_origin, scheduled_at, deposit_status, deposit_mp_payment_id",
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (appointmentError || !appointment) {
    return NextResponse.json(
      { error: "No encontramos el turno." },
      { status: 404 },
    );
  }

  const currentAppointment = appointment as AppointmentRow;
  const [{ data: membership }, { data: workspace }] = currentAppointment.workspace_id
    ? await Promise.all([
        admin
          .from("workspace_members")
          .select("role")
          .eq("workspace_id", currentAppointment.workspace_id)
          .eq("user_id", user.id)
          .eq("status", "accepted")
          .maybeSingle(),
        admin
          .from("workspaces")
          .select("type")
          .eq("id", currentAppointment.workspace_id)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const membershipRole = (membership as { role?: string } | null)?.role;
  // Staff = ADMIN, o RECEPCION en una clínica (igual que is_workspace_staff).
  const isWorkspaceStaff =
    membershipRole === "ADMIN" ||
    (membershipRole === "RECEPCION" &&
      (workspace as { type?: string } | null)?.type === "CLINICA");
  const canUpdateAppointment =
    currentAppointment.owner_id === user.id || isWorkspaceStaff;

  if (!canUpdateAppointment) {
    return NextResponse.json(
      { error: "No tenés permisos para actualizar este turno." },
      { status: 403 },
    );
  }

  // En un turno de clínica, el profesional asignado solo registra asistencia;
  // cancelarlo o cambiarlo a otro estado le corresponde a la clínica (staff).
  if (
    currentAppointment.appointment_origin === "clinic" &&
    !isWorkspaceStaff &&
    status !== "attended" &&
    status !== "no_show"
  ) {
    return NextResponse.json(
      { error: "Este turno lo gestiona la clínica: solo podés registrar la asistencia." },
      { status: 403 },
    );
  }

  // Un turno esperando la seña solo se puede cancelar (o se libera solo al
  // vencer); la asistencia se registra cuando ya está confirmado.
  if (currentAppointment.status === "awaiting_payment" && status !== "cancelled") {
    return NextResponse.json(
      { error: "Este turno todavía espera el pago de la seña." },
      { status: 409 },
    );
  }

  const cancelling = status === "cancelled" && currentAppointment.status !== "cancelled";
  const cancellationActor = cancelledBy === "patient" ? "patient" : "professional";

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
      ...(cancelling
        ? { cancelled_at: new Date().toISOString(), cancelled_by: cancellationActor }
        : {}),
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
          ? toArgentinaDateValue()
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

  // Seña cobrada: se devuelve si cancela el profesional o el paciente con la
  // anticipación configurada; si no, queda retenida.
  let deposit: { result: "refunded" | "refund_failed" | "retained" } | null = null;

  if (cancelling && currentAppointment.deposit_status === "paid" && currentAppointment.workspace_id) {
    const settings = await loadDepositSettings(admin, currentAppointment.workspace_id);
    const decision = decideCancellationRefund({
      cancellationWindowHours: settings?.cancellation_window_hours ?? 0,
      cancelledBy: cancellationActor,
      depositStatus: currentAppointment.deposit_status,
      scheduledAt: currentAppointment.scheduled_at,
    });

    if (decision === "refund") {
      deposit = { result: await refundDeposit(admin, currentAppointment) };
    } else if (decision === "retain") {
      await admin
        .from("appointments")
        .update({ deposit_status: "retained" })
        .eq("id", currentAppointment.id)
        .eq("deposit_status", "paid");
      deposit = { result: "retained" };
    }
  }

  return NextResponse.json({ deposit, ok: true, treatmentCompleted });
}

