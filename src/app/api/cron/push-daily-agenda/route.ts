import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { isPushEnabled, sendPushToUsers } from "@/lib/push";

type AppointmentRow = {
  clinic_professional_id: string | null;
  owner_id: string;
  scheduled_at: string;
};

const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
// Argentina no tiene horario de verano: UTC-3 fijo.
const ARGENTINA_UTC_OFFSET = "-03:00";

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

function formatArgentinaTime(value: string) {
  return new Date(value).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: ARGENTINA_TIME_ZONE,
  });
}

function buildBody(appointments: AppointmentRow[]) {
  const first = formatArgentinaTime(appointments[0].scheduled_at);

  if (appointments.length === 1) {
    return `Hoy tenés 1 turno, a las ${first}.`;
  }

  return `Hoy tenés ${appointments.length} turnos. El primero es a las ${first}.`;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!isPushEnabled()) {
    return NextResponse.json({ skipped: "push_disabled" });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ error: "Supabase no esta configurado." }, { status: 500 });
  }

  const { data: subscriptionsData, error: subscriptionsError } = await admin
    .from("push_subscriptions")
    .select("user_id");

  if (subscriptionsError) {
    console.error("push daily agenda subscriptions lookup failed", subscriptionsError);
    return NextResponse.json(
      { error: "No pudimos buscar las suscripciones." },
      { status: 500 },
    );
  }

  const subscribedUserIds = new Set(
    (subscriptionsData ?? []).map((row) => (row as { user_id: string }).user_id),
  );

  if (subscribedUserIds.size === 0) {
    return NextResponse.json({ notifiedUsers: 0, skipped: "no_subscriptions" });
  }

  const today = formatArgentinaDateValue(new Date());
  const dayStart = new Date(`${today}T00:00:00${ARGENTINA_UTC_OFFSET}`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const { data: appointmentsData, error: appointmentsError } = await admin
    .from("appointments")
    .select("owner_id, clinic_professional_id, scheduled_at")
    .gte("scheduled_at", dayStart.toISOString())
    .lt("scheduled_at", dayEnd.toISOString())
    .neq("status", "cancelled")
    .neq("status", "no_show")
    .order("scheduled_at", { ascending: true });

  if (appointmentsError) {
    console.error("push daily agenda appointments lookup failed", appointmentsError);
    return NextResponse.json(
      { error: "No pudimos buscar los turnos del día." },
      { status: 500 },
    );
  }

  const appointments = (appointmentsData ?? []) as AppointmentRow[];
  const clinicProfessionalIds = Array.from(
    new Set(
      appointments
        .map((appointment) => appointment.clinic_professional_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const professionalUserIds = new Map<string, string>();

  if (clinicProfessionalIds.length > 0) {
    const { data: professionalsData, error: professionalsError } = await admin
      .from("clinic_professionals")
      .select("id, professional_id")
      .in("id", clinicProfessionalIds);

    if (professionalsError) {
      console.error("push daily agenda professionals lookup failed", professionalsError);
      return NextResponse.json(
        { error: "No pudimos resolver los profesionales." },
        { status: 500 },
      );
    }

    for (const professional of professionalsData ?? []) {
      const row = professional as { id: string; professional_id: string | null };

      if (row.professional_id) {
        professionalUserIds.set(row.id, row.professional_id);
      }
    }
  }

  // Cada turno se le avisa a quien lo atiende: el profesional de la clínica
  // si está asignado, o el dueño del turno si es independiente.
  const appointmentsByUser = new Map<string, AppointmentRow[]>();

  for (const appointment of appointments) {
    const userId = appointment.clinic_professional_id
      ? professionalUserIds.get(appointment.clinic_professional_id)
      : appointment.owner_id;

    if (!userId || !subscribedUserIds.has(userId)) {
      continue;
    }

    const list = appointmentsByUser.get(userId) ?? [];
    list.push(appointment);
    appointmentsByUser.set(userId, list);
  }

  let notifiedUsers = 0;
  let skippedAlreadySent = 0;
  let sent = 0;
  let failed = 0;

  for (const [userId, userAppointments] of appointmentsByUser) {
    const { error: logError } = await admin.from("push_notification_log").insert({
      kind: "daily_agenda",
      ref_key: today,
      user_id: userId,
    });

    if (logError) {
      if (logError.code === "23505") {
        skippedAlreadySent += 1;
        continue;
      }

      console.error("push daily agenda log failed", logError);
      continue;
    }

    const result = await sendPushToUsers(admin, [userId], {
      body: buildBody(userAppointments),
      tag: `daily-agenda-${today}`,
      title: "Tus turnos de hoy",
      url: "/dashboard/turnos/hoy",
    });

    if (result.sent === 0) {
      // No llegó a ningún dispositivo: liberamos el registro para que un
      // reintento del cron pueda volver a intentarlo.
      await admin
        .from("push_notification_log")
        .delete()
        .eq("user_id", userId)
        .eq("kind", "daily_agenda")
        .eq("ref_key", today);
    } else {
      notifiedUsers += 1;
    }

    sent += result.sent;
    failed += result.failed;
  }

  return NextResponse.json({
    date: today,
    failed,
    notifiedUsers,
    sent,
    skippedAlreadySent,
  });
}
