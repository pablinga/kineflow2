import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

type ProfileRow = {
  full_name: string | null;
};

type PatientRow = {
  full_name: string;
  phone_e164: string | null;
  whatsapp_consent: boolean | null;
};

type ClinicProfessionalRow = {
  id: string;
  professional_email: string;
  profiles: ProfileRow | ProfileRow[] | null;
};

type AppointmentRow = {
  id: string;
  clinic_professional_id: string | null;
  owner_id: string;
  patient_id: string;
  patients: PatientRow | PatientRow[] | null;
  scheduled_at: string;
  workspace_id: string;
};

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const REMINDER_TEMPLATE_LANGUAGE_CODE = "es";

function getProfileName(profile: ProfileRow | ProfileRow[] | null) {
  const row = Array.isArray(profile) ? profile[0] : profile;
  return row?.full_name?.trim() || null;
}

function getPatient(patient: PatientRow | PatientRow[] | null) {
  return Array.isArray(patient) ? patient[0] : patient;
}

function formatArgentinaDateValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function formatReminderDateLabel(scheduledAt: string) {
  const appointmentDate = new Date(scheduledAt);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (formatArgentinaDateValue(appointmentDate) === formatArgentinaDateValue(tomorrow)) {
    return "mañana";
  }

  return `el ${appointmentDate.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
    weekday: "long",
  })}`;
}

function formatReminderTime(scheduledAt: string) {
  return new Date(scheduledAt).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
  });
}

async function trackReminderNotification(params: {
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
  appointmentId: string;
  errorMessage?: string;
  patientId: string;
  providerMessageId?: string | null;
  status: "sent" | "failed";
}) {
  const { error } = await params.admin.from("appointment_notifications").insert({
    appointment_id: params.appointmentId,
    error_message: params.errorMessage,
    notification_type: "reminder",
    patient_id: params.patientId,
    provider: "meta",
    provider_message_id: params.providerMessageId,
    sent_at: params.status === "sent" ? new Date().toISOString() : null,
    status: params.status,
  });

  if (error) {
    console.error("appointment reminder tracking failed", error);
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase no esta configurado." },
      { status: 500 },
    );
  }

  const windowStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const windowEnd = new Date(Date.now() + 25 * 60 * 60 * 1000);

  const { data: appointmentsData, error: appointmentsError } = await admin
    .from("appointments")
    .select(
      "id, scheduled_at, owner_id, patient_id, clinic_professional_id, workspace_id, patients(full_name, phone_e164, whatsapp_consent)",
    )
    .gte("scheduled_at", windowStart.toISOString())
    .lt("scheduled_at", windowEnd.toISOString())
    .neq("status", "cancelled")
    .neq("status", "no_show");

  if (appointmentsError) {
    console.error("appointment reminder lookup failed", appointmentsError);
    return NextResponse.json(
      { error: "No pudimos buscar los turnos a recordar." },
      { status: 500 },
    );
  }

  const appointments = (appointmentsData ?? []) as AppointmentRow[];
  const eligibleAppointments = appointments.filter((appointment) => {
    const patient = getPatient(appointment.patients);
    return Boolean(patient?.whatsapp_consent && patient.phone_e164);
  });

  const appointmentIds = eligibleAppointments.map((appointment) => appointment.id);
  const alreadySentIds = new Set<string>();

  if (appointmentIds.length > 0) {
    const { data: notificationsData, error: notificationsError } = await admin
      .from("appointment_notifications")
      .select("appointment_id")
      .in("appointment_id", appointmentIds)
      .eq("notification_type", "reminder")
      .eq("status", "sent");

    if (notificationsError) {
      console.error("appointment reminder duplicate check failed", notificationsError);
      return NextResponse.json(
        { error: "No pudimos revisar los recordatorios enviados." },
        { status: 500 },
      );
    }

    for (const notification of notificationsData ?? []) {
      const appointmentId = (notification as { appointment_id: string }).appointment_id;
      alreadySentIds.add(appointmentId);
    }
  }

  const pendingAppointments = eligibleAppointments.filter(
    (appointment) => !alreadySentIds.has(appointment.id),
  );
  const ownerIds = Array.from(
    new Set(
      pendingAppointments
        .filter((appointment) => !appointment.clinic_professional_id)
        .map((appointment) => appointment.owner_id),
    ),
  );
  const independentWorkspaceIds = Array.from(
    new Set(
      pendingAppointments
        .filter((appointment) => !appointment.clinic_professional_id)
        .map((appointment) => appointment.workspace_id),
    ),
  );
  const clinicProfessionalIds = Array.from(
    new Set(
      pendingAppointments
        .map((appointment) => appointment.clinic_professional_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const ownerNames = new Map<string, string>();
  const workspaceNames = new Map<string, string>();
  const clinicProfessionalNames = new Map<string, string>();

  if (independentWorkspaceIds.length > 0) {
    const { data: workspacesData, error: workspacesError } = await admin
      .from("workspaces")
      .select("id, name")
      .in("id", independentWorkspaceIds);

    if (workspacesError) {
      console.error("appointment reminder workspace lookup failed", workspacesError);
      return NextResponse.json(
        { error: "No pudimos resolver los espacios de trabajo." },
        { status: 500 },
      );
    }

    for (const workspace of workspacesData ?? []) {
      const row = workspace as { id: string; name: string };
      workspaceNames.set(row.id, row.name.trim());
    }
  }

  if (ownerIds.length > 0) {
    const { data: profilesData, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);

    if (profilesError) {
      console.error("appointment reminder profile lookup failed", profilesError);
      return NextResponse.json(
        { error: "No pudimos resolver los profesionales." },
        { status: 500 },
      );
    }

    for (const profile of profilesData ?? []) {
      const row = profile as { full_name: string | null; id: string };
      ownerNames.set(row.id, row.full_name?.trim() || "");
    }
  }

  if (clinicProfessionalIds.length > 0) {
    const { data: professionalsData, error: professionalsError } = await admin
      .from("clinic_professionals")
      .select("id, professional_email, profiles(full_name)")
      .in("id", clinicProfessionalIds);

    if (professionalsError) {
      console.error("appointment reminder clinic professional lookup failed", professionalsError);
      return NextResponse.json(
        { error: "No pudimos resolver los profesionales." },
        { status: 500 },
      );
    }

    for (const professional of (professionalsData ?? []) as ClinicProfessionalRow[]) {
      clinicProfessionalNames.set(
        professional.id,
        getProfileName(professional.profiles) ??
          professional.professional_email.split("@")[0] ??
          "Profesional",
      );
    }
  }

  let sent = 0;
  let failed = 0;

  for (const appointment of pendingAppointments) {
    const patient = getPatient(appointment.patients);

    if (!patient?.phone_e164) {
      continue;
    }

    const professionalName = appointment.clinic_professional_id
      ? clinicProfessionalNames.get(appointment.clinic_professional_id) ?? "Profesional"
      : ownerNames.get(appointment.owner_id) ||
        workspaceNames.get(appointment.workspace_id) ||
        "Profesional";

    try {
      const message = await sendWhatsAppMessage({
        templateLanguageCode: REMINDER_TEMPLATE_LANGUAGE_CODE,
        templateName: "recordatorio_turno",
        templateParams: [
          patient.full_name,
          professionalName,
          formatReminderDateLabel(appointment.scheduled_at),
          formatReminderTime(appointment.scheduled_at),
        ],
        to: patient.phone_e164,
      });

      await trackReminderNotification({
        admin,
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        providerMessageId: message.sid,
        status: "sent",
      });
      sent += 1;
    } catch (error) {
      await trackReminderNotification({
        admin,
        appointmentId: appointment.id,
        errorMessage:
          error instanceof Error
            ? error.message
            : "No pudimos enviar el recordatorio por WhatsApp.",
        patientId: appointment.patient_id,
        status: "failed",
      });
      failed += 1;
    }
  }

  return NextResponse.json({
    failed,
    processed: pendingAppointments.length,
    skippedAlreadySent: alreadySentIds.size,
    skippedWithoutWhatsApp: appointments.length - eligibleAppointments.length,
    sent,
    windowEnd: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
  });
}
