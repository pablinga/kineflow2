import { NextRequest, NextResponse } from "next/server";
import {
  isSlotAvailable,
  normalizeDocumentNumber,
  normalizeDuration,
  resolveBookingContext,
} from "@/lib/public-booking";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

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
  lastName?: string;
  phone?: string;
  professionalId?: string;
  scheduledAt?: string;
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
  const scheduledAt = normalizeText(body.scheduledAt);
  const durationMinutes = normalizeDuration(body.durationMinutes);

  if (
    !professionalId ||
    !documentNumber ||
    !fullName ||
    !email ||
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
      .select("id")
      .eq("workspace_id", bookingContext.workspace.id)
      .eq("document_number", documentNumber)
      .limit(1);
    const { data: existingPatient, error: patientError } =
      await patientQuery.maybeSingle();

    if (patientError) {
      throw new Error("No pudimos revisar el DNI del paciente.");
    }

    let patientId = (existingPatient as { id: string } | null)?.id ?? null;

    if (!patientId) {
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
          status: "active",
          workspace_id: bookingContext.workspace.id,
        })
        .select("id")
        .single();

      if (insertPatientError) {
        throw new Error("No pudimos crear el paciente.");
      }

      patientId = (insertedPatient as { id: string }).id;
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

    const { error: appointmentError } = await admin.from("appointments").insert({
      appointment_origin: bookingContext.origin,
      clinic_id: bookingContext.clinicId,
      clinic_professional_id: bookingContext.clinicProfessionalId,
      duration_minutes: durationMinutes,
      modality: "presencial",
      notes: "Reserva creada desde enlace público.",
      owner_id: bookingContext.ownerId,
      patient_id: patientId,
      reason: "Sesion",
      scheduled_at: new Date(scheduledAt).toISOString(),
      status: "pending",
      workspace_id: bookingContext.workspace.id,
    });

    if (appointmentError) {
      return NextResponse.json(
        { error: "Ese horario ya no está disponible." },
        { status: 409 },
      );
    }

    const start = new Date(scheduledAt);

    return NextResponse.json({
      appointment: {
        date: start.toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "long",
          timeZone: "America/Argentina/Buenos_Aires",
          weekday: "long",
          year: "numeric",
        }),
        durationMinutes,
        professionalName: bookingContext.professional.name,
        time: start.toLocaleTimeString("es-AR", {
          hour: "2-digit",
          hour12: false,
          minute: "2-digit",
          timeZone: "America/Argentina/Buenos_Aires",
        }),
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
