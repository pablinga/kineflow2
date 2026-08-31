import { NextRequest, NextResponse } from "next/server";
import {
  isWorkspaceReadOnlyForBooking,
  isSlotAvailable,
  normalizeDocumentNumber,
  normalizeDuration,
  PUBLIC_BOOKING_UNAVAILABLE_MESSAGE,
  resolveBookingContext,
} from "@/lib/public-booking";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import {
  formatPhoneToE164,
  isWhatsAppNotificationsEnabled,
  sendWhatsAppMessage,
} from "@/lib/whatsapp";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

type BookingRequestBody = {
  company?: string;
  documentNumber?: string;
  durationMinutes?: number;
  email?: string;
  firstName?: string;
  fullName?: string;
  insuranceMemberNumber?: string;
  insuranceProviderId?: string;
  lastName?: string;
  phone?: string;
  professionalId?: string;
  scheduledAt?: string;
  whatsappConsent?: boolean;
};

type BookingPatient = {
  id: string;
  phone_e164: string | null;
  whatsapp_consent: boolean | null;
};

const attempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX_ATTEMPTS = 8;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function getClientIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimit(ip: string) {
  const now = Date.now();
  const current = attempts.get(ip);

  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  attempts.set(ip, current);

  return current.count > RATE_LIMIT_MAX_ATTEMPTS;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getFullName(body: BookingRequestBody) {
  return (
    normalizeText(body.fullName) ||
    `${normalizeText(body.firstName)} ${normalizeText(body.lastName)}`.trim()
  );
}

function formatAppointmentDateTime(scheduledAt: string) {
  const start = new Date(scheduledAt);

  return {
    date: start.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long",
      year: "numeric",
    }),
    time: start.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    }),
  };
}

async function trackAppointmentNotification(params: {
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

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const ip = getClientIp(request);
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin no está configurado." },
      { status: 500 },
    );
  }

  if (rateLimit(ip)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Probá de nuevo en unos minutos." },
      { status: 429 },
    );
  }

  const body = (await request.json()) as BookingRequestBody;

  if (normalizeText(body.company)) {
    return NextResponse.json({ ok: true });
  }

  const professionalId = normalizeText(body.professionalId);
  const documentNumber = normalizeDocumentNumber(
    normalizeText(body.documentNumber),
  );
  const fullName = getFullName(body);
  const email = normalizeText(body.email).toLowerCase();
  const phone = normalizeText(body.phone);
  const phoneE164 = formatPhoneToE164(phone);
  const scheduledAt = normalizeText(body.scheduledAt);
  const whatsappConsent =
    isWhatsAppNotificationsEnabled() && body.whatsappConsent === true;

  if (
    !professionalId ||
    !documentNumber ||
    !fullName ||
    !phone ||
    !scheduledAt
  ) {
    return NextResponse.json(
      { error: "Completá todos los datos para reservar." },
      { status: 400 },
    );
  }

  try {
    const bookingContext = await resolveBookingContext(
      admin,
      workspaceId,
      professionalId,
    );

    if (!bookingContext) {
      return NextResponse.json(
        { error: "No encontramos el profesional para este enlace." },
        { status: 404 },
      );
    }

    const durationMinutes = normalizeDuration(
      body.durationMinutes,
      bookingContext.workspace.default_session_duration_minutes,
    );

    if (await isWorkspaceReadOnlyForBooking(admin, bookingContext)) {
      return NextResponse.json(
        { error: PUBLIC_BOOKING_UNAVAILABLE_MESSAGE },
        { status: 409 },
      );
    }

    const available = await isSlotAvailable({
      admin,
      context: bookingContext,
      durationMinutes,
      scheduledAt,
    });

    if (!available) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible." },
        { status: 409 },
      );
    }

    const patientQuery = admin
      .from("patients")
      .select("id, phone_e164, whatsapp_consent")
      .eq("workspace_id", bookingContext.workspace.id)
      .eq("document_number", documentNumber)
      .limit(1);
    const { data: existingPatient, error: patientError } =
      await patientQuery.maybeSingle();

    if (patientError) {
      throw new Error("No pudimos revisar el DNI del paciente.");
    }

    let patient = (existingPatient as BookingPatient | null) ?? null;

    if (!patient) {
      const { data: insertedPatient, error: insertPatientError } = await admin
        .from("patients")
        .insert({
          assigned_professional_id:
            bookingContext.origin === "clinic" ? bookingContext.ownerId : null,
          clinic_id: bookingContext.clinicId,
          document_number: documentNumber,
          email,
          full_name: fullName,
          initial_condition: "Reserva web",
          owner_id:
            bookingContext.origin === "clinic"
              ? bookingContext.workspace.owner_id
              : bookingContext.ownerId,
          phone,
          phone_e164: phoneE164,
          status: "active",
          workspace_id: bookingContext.workspace.id,
          whatsapp_consent: whatsappConsent,
          whatsapp_consent_at: whatsappConsent ? new Date().toISOString() : null,
        })
        .select("id, phone_e164, whatsapp_consent")
        .single();

      if (insertPatientError) {
        if (
          insertPatientError.message?.includes(
            "período de prueba gratuita venció",
          )
        ) {
          return NextResponse.json(
            {
              error:
                "Este profesional no puede recibir nuevas reservas en este momento. Contactalo directamente para coordinar tu turno.",
            },
            { status: 409 },
          );
        }

        throw new Error("No pudimos crear el paciente.");
      }

      patient = insertedPatient as BookingPatient;
    } else if (whatsappConsent) {
      const { data: updatedPatient, error: updatePatientError } = await admin
        .from("patients")
        .update({
          phone_e164: phoneE164,
          whatsapp_consent: true,
          whatsapp_consent_at: new Date().toISOString(),
        })
        .eq("id", patient.id)
        .select("id, phone_e164, whatsapp_consent")
        .single();

      if (updatePatientError) {
        throw new Error("No pudimos actualizar el consentimiento de WhatsApp.");
      }

      patient = updatedPatient as BookingPatient;
    }

    const stillAvailable = await isSlotAvailable({
      admin,
      context: bookingContext,
      durationMinutes,
      scheduledAt,
    });

    if (!stillAvailable) {
      return NextResponse.json(
        { error: "Ese horario acaba de ser reservado por otra persona." },
        { status: 409 },
      );
    }

    let insuranceProviderId: string | null = null;
    const rawInsuranceProviderId = normalizeText(body.insuranceProviderId);

    if (rawInsuranceProviderId) {
      const { data: insuranceProvider } = await admin
        .from("insurance_providers")
        .select("id")
        .eq("id", rawInsuranceProviderId)
        .eq("workspace_id", bookingContext.workspace.id)
        .eq("active", true)
        .maybeSingle();

      insuranceProviderId =
        (insuranceProvider as { id: string } | null)?.id ?? null;
    }

    const insuranceMemberNumber = insuranceProviderId
      ? normalizeText(body.insuranceMemberNumber) || null
      : null;
    const sessionAmount = insuranceProviderId
      ? 0
      : Number(bookingContext.workspace.default_session_price ?? 0);

    const { data: appointment, error: appointmentError } = await admin.from("appointments").insert({
      appointment_origin: bookingContext.origin,
      clinic_id: bookingContext.clinicId,
      clinic_professional_id: bookingContext.clinicProfessionalId,
      duration_minutes: durationMinutes,
      insurance_member_number: insuranceMemberNumber,
      insurance_provider_id: insuranceProviderId,
      modality: "presencial",
      notes: "Reserva creada desde enlace público.",
      owner_id: bookingContext.ownerId,
      patient_id: patient.id,
      reason: "Sesion",
      scheduled_at: new Date(scheduledAt).toISOString(),
      session_amount: sessionAmount,
      status: "pending",
      workspace_id: bookingContext.workspace.id,
    }).select("id")
      .single();

    if (appointmentError) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible." },
        { status: 409 },
      );
    }

    const appointmentId = (appointment as { id: string }).id;
    const appointmentDateTime = formatAppointmentDateTime(scheduledAt);

    if (
      isWhatsAppNotificationsEnabled() &&
      patient.whatsapp_consent &&
      patient.phone_e164
    ) {
      try {
        const message = await sendWhatsAppMessage({
          to: patient.phone_e164,
          templateName: "confirmacion_turno",
          templateLanguageCode: "es_AR",
          templateParams: [
            fullName,
            bookingContext.professional.name,
            appointmentDateTime.date,
            appointmentDateTime.time,
          ],
        });

        await trackAppointmentNotification({
          admin,
          appointmentId,
          patientId: patient.id,
          providerMessageId: message.sid,
          status: "sent",
        });
      } catch (whatsappError) {
        await trackAppointmentNotification({
          admin,
          appointmentId,
          errorMessage:
            whatsappError instanceof Error
              ? whatsappError.message
              : "No pudimos enviar el WhatsApp.",
          patientId: patient.id,
          status: "failed",
        });
      }
    }

    return NextResponse.json({
      appointment: {
        date: appointmentDateTime.date,
        durationMinutes,
        professionalName: bookingContext.professional.name,
        time: appointmentDateTime.time,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos crear la reserva.",
      },
      { status: 500 },
    );
  }
}
