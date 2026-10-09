import { NextResponse } from "next/server";
import { confirmStoredAppointment } from "@/lib/appointment-notifications";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

type AppointmentRow = {
  appointment_origin: string | null;
  clinic_professional_id: string | null;
  id: string;
  owner_id: string;
  patient_id: string;
  scheduled_at: string;
  workspace_id: string | null;
};

/**
 * Confirmación por WhatsApp de un turno recién cargado desde la agenda. La
 * llama useAppointments después de guardar el turno, sin esperar el
 * resultado. Mismo criterio de permisos que crear el turno: un turno
 * particular lo confirma su dueño; uno de clínica, el staff de la clínica
 * (ADMIN o RECEPCION).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json(
      { error: "Necesitás iniciar sesión." },
      { status: 401 },
    );
  }

  const { appointmentId } = (await request.json().catch(() => ({}))) as {
    appointmentId?: string;
  };

  if (!appointmentId) {
    return NextResponse.json(
      { error: "Falta el turno." },
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
    .select("id, owner_id, patient_id, scheduled_at, workspace_id, appointment_origin, clinic_professional_id")
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
  // El profesional del equipo no crea turnos de clínica: tampoco los confirma.
  const canConfirm =
    currentAppointment.appointment_origin === "clinic"
      ? isWorkspaceStaff
      : currentAppointment.owner_id === user.id || isWorkspaceStaff;

  if (!canConfirm) {
    return NextResponse.json(
      { error: "No tenés permisos sobre este turno." },
      { status: 403 },
    );
  }

  const outcome = await confirmStoredAppointment({
    admin,
    appointment: currentAppointment,
  });

  return NextResponse.json(
    outcome.send
      ? { result: "result" in outcome ? outcome.result : "sent", sent: true }
      : { reason: outcome.reason, sent: false },
  );
}
