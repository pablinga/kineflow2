// Inicio (usuario activo): cálculos y formatos puros, sin red. Los agregados
// vienen de la RPC get_dashboard_home (202610100002); acá solo se derivan
// porcentajes, textos y la lista de turnos de hoy.

export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

/**
 * Horas ahorradas (valor estimado, se muestra como tal):
 * - 3 minutos por recordatorio de WhatsApp enviado (lo que tardaría escribirlo
 *   a mano).
 * - 5 minutos por reserva online (coordinar el turno por mensaje).
 */
export const MINUTES_SAVED_PER_REMINDER = 3;
export const MINUTES_SAVED_PER_ONLINE_BOOKING = 5;

export type DashboardHomeStats = {
  today: string;
  weekStart: string;
  weekAppointments: number;
  previousWeekAppointments: number;
  weekBookedMinutes: number;
  /** null: no hay horarios cargados (no se muestra la ocupación). */
  weekAvailableMinutes: number | null;
  monthCollected: number;
  pendingPaymentCount: number;
  pendingPaymentAmount: number;
  activePatients: number;
  monthAttended: number;
  monthCancelled: number;
  monthNoShow: number;
  /** null: ninguna ausencia tiene precio (ni el turno ni el espacio). */
  monthNoShowAmount: number | null;
  weeklyIncome: Array<{ weekStart: string; amount: number }>;
  patientsWithoutNextAppointment: number;
  sessionsWithoutEvolution: number;
  unregisteredAttendance: number;
  monthOnlineBookings: number;
};

export function getWeekDelta(current: number, previous: number) {
  const delta = current - previous;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";

  return {
    delta,
    label:
      delta === 0
        ? "Igual que la semana anterior"
        : `${sign}${Math.abs(delta)} vs. semana anterior`,
    positive: delta > 0,
  };
}

/** Porcentaje de ocupación, o null si no hay minutos disponibles. */
export function getOccupancyPercent(
  bookedMinutes: number,
  availableMinutes: number | null,
) {
  if (availableMinutes === null || availableMinutes <= 0) {
    return null;
  }

  return Math.round((bookedMinutes / availableMinutes) * 100);
}

export function getAttendanceSummary(counts: {
  attended: number;
  cancelled: number;
  noShow: number;
}) {
  const total = counts.attended + counts.cancelled + counts.noShow;

  return {
    attendedPercent:
      total === 0 ? null : Math.round((counts.attended / total) * 100),
    total,
  };
}

export function estimateHoursSaved(
  remindersSent: number | null,
  onlineBookings: number,
) {
  const minutes =
    (remindersSent ?? 0) * MINUTES_SAVED_PER_REMINDER +
    onlineBookings * MINUTES_SAVED_PER_ONLINE_BOOKING;

  // Redondeo a media hora: es una estimación.
  return Math.round((minutes / 60) * 2) / 2;
}

export function formatHours(hours: number) {
  return hours.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

/** "$118k", "$1,2M", "$900". Para etiquetas de gráficos. */
export function formatCompactCurrency(value: number) {
  const abs = Math.abs(value);

  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toLocaleString("es-AR", {
      maximumFractionDigits: 1,
    })}M`;
  }

  if (abs >= 1_000) {
    return `$${Math.round(value / 1_000).toLocaleString("es-AR")}k`;
  }

  return `$${Math.round(value).toLocaleString("es-AR")}`;
}

/** "Sábado 10 de octubre", en hora de Argentina. */
export function formatLongDate(date: Date) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    timeZone: ARGENTINA_TIME_ZONE,
    weekday: "long",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = get("weekday");

  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${get("day")} de ${get("month")}`;
}

/** "17 ago" a partir de "2026-08-17". */
export function formatShortDay(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}

/** Hora (0-23) de Argentina de un timestamp. */
export function getArgentinaHour(value: string | Date) {
  const hour = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: ARGENTINA_TIME_ZONE,
  }).format(new Date(value));

  return Number(hour) % 24;
}

type TodayAppointmentLike = {
  scheduledAt: string;
  durationMinutes: number;
  rawStatus: string;
};

/** "Ahora" si el turno está en curso; si no, null. */
export function isAppointmentInProgress(
  appointment: TodayAppointmentLike,
  now: Date,
) {
  const start = new Date(appointment.scheduledAt).getTime();
  const end = start + appointment.durationMinutes * 60_000;

  return now.getTime() >= start && now.getTime() < end;
}

/**
 * Turnos de hoy para el Inicio: primero los que ya empezaron y no tienen la
 * asistencia registrada, después los próximos; como mucho `limit`. Los que ya
 * tienen la asistencia marcada no se muestran. `later` son los próximos que
 * no entraron en la lista.
 */
export function pickTodayAppointments<T extends TodayAppointmentLike>(
  appointments: T[],
  now: Date,
  limit = 3,
) {
  const relevant = appointments
    .filter(
      (appointment) =>
        appointment.rawStatus !== "cancelled" &&
        appointment.rawStatus !== "rescheduled",
    )
    .filter((appointment) => {
      const started = new Date(appointment.scheduledAt).getTime() <= now.getTime();

      return !started || appointment.rawStatus === "pending";
    })
    .sort(
      (left, right) =>
        new Date(left.scheduledAt).getTime() -
        new Date(right.scheduledAt).getTime(),
    );
  const visible = relevant.slice(0, limit);
  const later = relevant.slice(limit);
  const allAfternoon =
    later.length > 0 &&
    later.every((appointment) => getArgentinaHour(appointment.scheduledAt) >= 13);

  return {
    later: later.length,
    laterLabel:
      later.length === 0
        ? ""
        : `+${later.length} ${later.length === 1 ? "turno" : "turnos"} ${
            allAfternoon ? "por la tarde" : "más tarde"
          }`,
    visible,
  };
}

export type ResolveRow = {
  id: "attendance" | "payments" | "next_appointment" | "evolutions";
  count: number;
  href: string;
  label: string;
};

/** Filas de "Para resolver" con contador > 0, en orden de urgencia. */
export function getResolveRows(params: {
  unregisteredAttendance: number;
  pendingPayments: number;
  patientsWithoutNextAppointment: number;
  sessionsWithoutEvolution: number;
  paymentsHref: string;
  /** Sin permiso para evoluciones (recepción): la fila no aplica. */
  includeEvolutions: boolean;
}): ResolveRow[] {
  const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : many;
  const rows: ResolveRow[] = [
    {
      count: params.unregisteredAttendance,
      href: "/dashboard/turnos",
      id: "attendance",
      label: plural(
        params.unregisteredAttendance,
        "turno sin registrar asistencia",
        "turnos sin registrar asistencia",
      ),
    },
    {
      count: params.pendingPayments,
      href: params.paymentsHref,
      id: "payments",
      label: plural(params.pendingPayments, "cobro pendiente", "cobros pendientes"),
    },
    {
      count: params.patientsWithoutNextAppointment,
      href: "/dashboard/pacientes",
      id: "next_appointment",
      label: plural(
        params.patientsWithoutNextAppointment,
        "paciente sin próximo turno",
        "pacientes sin próximo turno",
      ),
    },
    ...(params.includeEvolutions
      ? [
          {
            count: params.sessionsWithoutEvolution,
            href: "/dashboard/evoluciones",
            id: "evolutions" as const,
            label: plural(
              params.sessionsWithoutEvolution,
              "sesión sin evolución cargada",
              "sesiones sin evolución cargada",
            ),
          },
        ]
      : []),
  ];

  return rows.filter((row) => row.count > 0);
}
