import type { SupabaseClient } from "@supabase/supabase-js";

export type WorkspaceType = "PERSONAL" | "CLINICA";

export type PublicBookingWorkspace = {
  id: string;
  name: string;
  owner_id: string | null;
  source_clinic_id: string | null;
  type: WorkspaceType;
};

export type PublicBookingProfessional = {
  id: string;
  name: string;
};

export type BookingContext = {
  clinicId: string | null;
  clinicProfessionalId: string | null;
  origin: "independent" | "clinic";
  ownerId: string;
  professional: PublicBookingProfessional;
  workspace: PublicBookingWorkspace;
};

type ProfileRow = {
  full_name: string | null;
};

type ClinicProfessionalRow = {
  id: string;
  professional_email: string;
  professional_id: string | null;
  profiles: ProfileRow | ProfileRow[] | null;
};

type AvailabilityRow = {
  active: boolean;
  ends_at: string;
  starts_at: string;
  valid_from: string | null;
  valid_to: string | null;
  weekday: number;
};

type AppointmentSlotRow = {
  duration_minutes: number;
  scheduled_at: string;
};

export type FreeSlot = {
  date: string;
  end: string;
  endTime: string;
  start: string;
  startTime: string;
};

const DEFAULT_DURATION_MINUTES = 45;
const VALID_DURATIONS = new Set([30, 45, 60, 90]);
const TIME_ZONE_OFFSET = "-03:00";
const ACTIVE_APPOINTMENT_STATUSES = ["pending", "confirmed", "rescheduled"];

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function parseTimeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = normalizeTime(value).split(":");

  return Number(hours) * 60 + Number(minutes);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeValue(date: Date) {
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function getWeekday(dateValue: string) {
  return new Date(`${dateValue}T00:00:00${TIME_ZONE_OFFSET}`).getUTCDay();
}

function buildLocalIso(dateValue: string, minutes: number) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");

  return new Date(`${dateValue}T${hours}:${mins}:00${TIME_ZONE_OFFSET}`).toISOString();
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function getProfileName(profile: ProfileRow | ProfileRow[] | null) {
  const row = Array.isArray(profile) ? profile[0] : profile;
  return row?.full_name?.trim() || null;
}

export function normalizeDocumentNumber(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeDuration(value: unknown) {
  const duration = Number(value);
  return VALID_DURATIONS.has(duration) ? duration : DEFAULT_DURATION_MINUTES;
}

export async function getWorkspace(
  admin: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await admin
    .from("workspaces")
    .select("id, name, owner_id, source_clinic_id, type")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error("No pudimos cargar el espacio de trabajo.");
  }

  return data as PublicBookingWorkspace | null;
}

export async function getPublicProfessionals(
  admin: SupabaseClient,
  workspace: PublicBookingWorkspace,
): Promise<PublicBookingProfessional[]> {
  if (workspace.type === "PERSONAL") {
    if (!workspace.owner_id) {
      return [];
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", workspace.owner_id)
      .maybeSingle();

    return [
      {
        id: workspace.owner_id,
        name: ((profile as ProfileRow | null)?.full_name ?? workspace.name).trim(),
      },
    ];
  }

  if (!workspace.source_clinic_id) {
    return [];
  }

  const { data, error } = await admin
    .from("clinic_professionals")
    .select("id, professional_id, professional_email, profiles(full_name)")
    .eq("clinic_id", workspace.source_clinic_id)
    .in("status", ["active", "accepted"])
    .not("professional_id", "is", null)
    .order("professional_email", { ascending: true });

  if (error) {
    throw new Error("No pudimos cargar los profesionales.");
  }

  return ((data ?? []) as ClinicProfessionalRow[]).map((professional) => ({
    id: professional.id,
    name:
      getProfileName(professional.profiles) ??
      professional.professional_email.split("@")[0] ??
      "Profesional",
  }));
}

export async function resolveBookingContext(
  admin: SupabaseClient,
  workspaceId: string,
  professionalId: string,
): Promise<BookingContext | null> {
  const workspace = await getWorkspace(admin, workspaceId);

  if (!workspace) {
    return null;
  }

  if (workspace.type === "PERSONAL") {
    if (!workspace.owner_id || professionalId !== workspace.owner_id) {
      return null;
    }

    const professionals = await getPublicProfessionals(admin, workspace);
    const professional = professionals[0];

    if (!professional) {
      return null;
    }

    return {
      clinicId: null,
      clinicProfessionalId: null,
      origin: "independent",
      ownerId: workspace.owner_id,
      professional,
      workspace,
    };
  }

  if (!workspace.source_clinic_id) {
    return null;
  }

  const { data, error } = await admin
    .from("clinic_professionals")
    .select("id, professional_id, professional_email, profiles(full_name)")
    .eq("id", professionalId)
    .eq("clinic_id", workspace.source_clinic_id)
    .in("status", ["active", "accepted"])
    .not("professional_id", "is", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const professional = data as ClinicProfessionalRow;

  if (!professional.professional_id) {
    return null;
  }

  return {
    clinicId: workspace.source_clinic_id,
    clinicProfessionalId: professional.id,
    origin: "clinic",
    ownerId: professional.professional_id,
    professional: {
      id: professional.id,
      name:
        getProfileName(professional.profiles) ??
        professional.professional_email.split("@")[0] ??
        "Profesional",
    },
    workspace,
  };
}

async function getAvailabilityRows(admin: SupabaseClient, context: BookingContext) {
  if (context.origin === "independent") {
    const { data, error } = await admin
      .from("independent_availability")
      .select("weekday, starts_at, ends_at, active, valid_from, valid_to")
      .eq("owner_id", context.ownerId)
      .eq("active", true);

    if (error) {
      throw new Error("No pudimos cargar la disponibilidad.");
    }

    return (data ?? []) as AvailabilityRow[];
  }

  const { data, error } = await admin
    .from("clinic_professional_availability")
    .select("weekday, starts_at, ends_at, active, valid_from, valid_to")
    .eq("clinic_professional_id", context.clinicProfessionalId)
    .eq("active", true);

  if (error) {
    throw new Error("No pudimos cargar la disponibilidad.");
  }

  return (data ?? []) as AvailabilityRow[];
}

async function getBookedAppointments(
  admin: SupabaseClient,
  context: BookingContext,
  from: string,
  to: string,
) {
  const fromIso = new Date(`${from}T00:00:00${TIME_ZONE_OFFSET}`).toISOString();
  const toExclusiveIso = new Date(`${to}T00:00:00${TIME_ZONE_OFFSET}`);
  toExclusiveIso.setUTCDate(toExclusiveIso.getUTCDate() + 1);

  const query = admin
    .from("appointments")
    .select("scheduled_at, duration_minutes")
    .eq("owner_id", context.ownerId)
    .in("status", ACTIVE_APPOINTMENT_STATUSES)
    .gte("scheduled_at", fromIso)
    .lt("scheduled_at", toExclusiveIso.toISOString());

  const { data, error } = await query;

  if (error) {
    throw new Error("No pudimos revisar los turnos ocupados.");
  }

  return (data ?? []) as AppointmentSlotRow[];
}

export async function getFreeSlots(params: {
  admin: SupabaseClient;
  context: BookingContext;
  durationMinutes: number;
  from: string;
  to: string;
}) {
  const availability = await getAvailabilityRows(params.admin, params.context);
  const bookedAppointments = await getBookedAppointments(
    params.admin,
    params.context,
    params.from,
    params.to,
  );
  const fromDate = new Date(`${params.from}T00:00:00.000Z`);
  const toDate = new Date(`${params.to}T00:00:00.000Z`);
  const slots: FreeSlot[] = [];

  for (
    let currentDate = fromDate;
    currentDate.getTime() <= toDate.getTime();
    currentDate = addDays(currentDate, 1)
  ) {
    const date = formatDateValue(currentDate);
    const weekday = getWeekday(date);
    const dayAvailability = availability.filter((item) => {
      if (item.weekday !== weekday) {
        return false;
      }

      if (item.valid_from && date < item.valid_from) {
        return false;
      }

      if (item.valid_to && date > item.valid_to) {
        return false;
      }

      return true;
    });

    for (const block of dayAvailability) {
      const blockStart = parseTimeToMinutes(block.starts_at);
      const blockEnd = parseTimeToMinutes(block.ends_at);

      for (
        let startMinutes = blockStart;
        startMinutes + params.durationMinutes <= blockEnd;
        startMinutes += params.durationMinutes
      ) {
        const start = buildLocalIso(date, startMinutes);
        const end = buildLocalIso(date, startMinutes + params.durationMinutes);
        const startTime = new Date(start).getTime();
        const endTime = new Date(end).getTime();
        const isBooked = bookedAppointments.some((appointment) =>
          overlaps(
            startTime,
            endTime,
            new Date(appointment.scheduled_at).getTime(),
            new Date(appointment.scheduled_at).getTime() +
              appointment.duration_minutes * 60 * 1000,
          ),
        );

        if (!isBooked && startTime > Date.now()) {
          slots.push({
            date,
            end,
            endTime: formatTimeValue(new Date(end)),
            start,
            startTime: formatTimeValue(new Date(start)),
          });
        }
      }
    }
  }

  return slots;
}

export async function isSlotAvailable(params: {
  admin: SupabaseClient;
  context: BookingContext;
  durationMinutes: number;
  scheduledAt: string;
}) {
  const scheduledAt = new Date(params.scheduledAt);

  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    return false;
  }

  const date = formatDateValue(
    new Date(`${params.scheduledAt.slice(0, 10)}T00:00:00.000Z`),
  );
  const slots = await getFreeSlots({
    admin: params.admin,
    context: params.context,
    durationMinutes: params.durationMinutes,
    from: date,
    to: date,
  });

  return slots.some((slot) => slot.start === scheduledAt.toISOString());
}
