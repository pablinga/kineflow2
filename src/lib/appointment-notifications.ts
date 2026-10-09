import {
  CONFIRMATION_MIN_LEAD_MINUTES,
  decideAppointmentConfirmation,
  formatAppointmentDateTime,
  type ConfirmationDecision,
} from "@/lib/appointment-confirmation-rules";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { isWhatsAppNotificationsEnabled, sendWhatsAppMessage } from "@/lib/whatsapp";

/**
 * Confirmación de turno por WhatsApp (plantilla confirmacion_turno). La usan
 * la reserva online y los turnos que carga el profesional desde la agenda
 * (/api/appointments/confirm-notification). Cada intento queda en
 * appointment_notifications con notification_type = 'confirmation', así no
 * se confunde con el recordatorio de 24 h del cron.
 */

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const WHATSAPP_SEND_WINDOW_MINUTES = 1440;
const WHATSAPP_SEND_MAX = 2;
export const THROTTLED_CONFIRMATION_MESSAGE =
  "Envío omitido: límite de notificaciones por teléfono alcanzado.";

export async function trackAppointmentNotification(params: {
  admin: SupabaseAdminClient;
  appointmentId: string;
  errorMessage?: string;
  patientId: string;
  providerMessageId?: string | null;
  status: "sent" | "failed";
}) {
  const { error } = await params.admin.from("appointment_notifications").insert({
    appointment_id: params.appointmentId,
    error_message: params.errorMessage,
    notification_type: "confirmation",
    patient_id: params.patientId,
    provider: "twilio",
    provider_message_id: params.providerMessageId,
    sent_at: params.status === "sent" ? new Date().toISOString() : null,
    status: params.status,
  });

  if (error) {
    console.error("appointment notification tracking failed", error);
  }
}

/** true si el teléfono superó el límite de mensajes del día en el workspace. */
export async function isWhatsAppSendThrottled(
  admin: SupabaseAdminClient,
  phoneE164: string,
  workspaceId: string,
) {
  const { data, error } = await admin.rpc("check_whatsapp_send_throttle", {
    p_phone_e164: phoneE164,
    p_workspace_id: workspaceId,
    p_window_minutes: WHATSAPP_SEND_WINDOW_MINUTES,
    p_max_sends: WHATSAPP_SEND_MAX,
  });

  if (error) {
    console.error("whatsapp send throttle check failed", error);
    return false;
  }

  return Boolean(data);
}

/** Manda la plantilla y registra el resultado (sent o failed). */
export async function sendAppointmentConfirmation(params: {
  admin: SupabaseAdminClient;
  appointmentId: string;
  patientId: string;
  patientName: string;
  phoneE164: string;
  professionalName: string;
  scheduledAt: string;
}) {
  const { date, time } = formatAppointmentDateTime(params.scheduledAt);

  try {
    const message = await sendWhatsAppMessage({
      to: params.phoneE164,
      templateName: "confirmacion_turno",
      templateLanguageCode: "es_AR",
      templateParams: [params.patientName, params.professionalName, date, time],
    });

    await trackAppointmentNotification({
      admin: params.admin,
      appointmentId: params.appointmentId,
      patientId: params.patientId,
      providerMessageId: message.sid,
      status: "sent",
    });

    return "sent" as const;
  } catch (whatsappError) {
    await trackAppointmentNotification({
      admin: params.admin,
      appointmentId: params.appointmentId,
      errorMessage:
        whatsappError instanceof Error
          ? whatsappError.message
          : "No pudimos enviar el WhatsApp.",
      patientId: params.patientId,
      status: "failed",
    });

    return "failed" as const;
  }
}

/**
 * Nombre del profesional para el mensaje, con la misma regla que el cron de
 * recordatorios: en un turno de clínica, el profesional del turno; si no, el
 * dueño del turno o el nombre del workspace.
 */
export async function getAppointmentProfessionalName(
  admin: SupabaseAdminClient,
  appointment: {
    clinic_professional_id: string | null;
    owner_id: string;
    workspace_id: string | null;
  },
) {
  if (appointment.clinic_professional_id) {
    const { data } = await admin
      .from("clinic_professionals")
      .select("professional_email, profiles(full_name)")
      .eq("id", appointment.clinic_professional_id)
      .maybeSingle();
    const row = data as {
      professional_email: string;
      profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
    } | null;
    const profile = Array.isArray(row?.profiles) ? row?.profiles[0] : row?.profiles;

    return (
      profile?.full_name?.trim() ||
      row?.professional_email.split("@")[0] ||
      "Profesional"
    );
  }

  const [{ data: profile }, { data: workspace }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", appointment.owner_id).maybeSingle(),
    appointment.workspace_id
      ? admin.from("workspaces").select("name").eq("id", appointment.workspace_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    (profile as { full_name: string | null } | null)?.full_name?.trim() ||
    (workspace as { name: string } | null)?.name?.trim() ||
    "Profesional"
  );
}

/**
 * Confirmación de un turno ya guardado que cargó el profesional. Aplica todas
 * las reglas de decideAppointmentConfirmation; si alguna no se cumple no manda
 * nada (no es un error). Con throttle registra el intento como failed, igual
 * que la reserva online.
 */
export async function confirmStoredAppointment(params: {
  admin: SupabaseAdminClient;
  appointment: {
    clinic_professional_id: string | null;
    id: string;
    owner_id: string;
    patient_id: string;
    scheduled_at: string;
    workspace_id: string | null;
  };
}): Promise<ConfirmationDecision | { result: "sent" | "failed"; send: true }> {
  const { admin, appointment } = params;
  const { data: patientData } = await admin
    .from("patients")
    .select("full_name, phone_e164, whatsapp_consent")
    .eq("id", appointment.patient_id)
    .maybeSingle();
  const patient = patientData as {
    full_name: string;
    phone_e164: string | null;
    whatsapp_consent: boolean | null;
  } | null;

  if (!patient) {
    return { reason: "no_consent", send: false };
  }

  const baseInput = {
    enabled: isWhatsAppNotificationsEnabled(),
    minLeadMinutes: CONFIRMATION_MIN_LEAD_MINUTES,
    now: Date.now(),
    patient,
    scheduledAt: appointment.scheduled_at,
  };
  // Primero las reglas que no consultan la base: un paciente sin
  // consentimiento no consume el límite de mensajes del teléfono.
  const preliminary = decideAppointmentConfirmation({
    ...baseInput,
    alreadyConfirmed: false,
    throttled: false,
  });

  if (!preliminary.send) {
    return preliminary;
  }

  const { count: sentCount } = await admin
    .from("appointment_notifications")
    .select("id", { count: "exact", head: true })
    .eq("appointment_id", appointment.id)
    .eq("notification_type", "confirmation")
    .eq("status", "sent");
  const alreadyConfirmed = (sentCount ?? 0) > 0;
  const throttled =
    !alreadyConfirmed && appointment.workspace_id && patient.phone_e164
      ? await isWhatsAppSendThrottled(admin, patient.phone_e164, appointment.workspace_id)
      : false;
  const decision = decideAppointmentConfirmation({ ...baseInput, alreadyConfirmed, throttled });

  if (!decision.send) {
    if (decision.reason === "throttled") {
      await trackAppointmentNotification({
        admin,
        appointmentId: appointment.id,
        errorMessage: THROTTLED_CONFIRMATION_MESSAGE,
        patientId: appointment.patient_id,
        status: "failed",
      });
    }

    return decision;
  }

  const result = await sendAppointmentConfirmation({
    admin,
    appointmentId: appointment.id,
    patientId: appointment.patient_id,
    patientName: patient.full_name,
    phoneE164: patient.phone_e164 as string,
    professionalName: await getAppointmentProfessionalName(admin, appointment),
    scheduledAt: appointment.scheduled_at,
  });

  return { result, send: true };
}
