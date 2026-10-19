// Lógica pura de la agenda "Dar turno" de las clínicas: color de cada día del
// mes según los horarios libres y lista del día que mezcla turnos dados y
// horarios libres. Sin React ni Supabase, para poder testearla.

export type AgendaSlotProfessional = {
  clinicProfessionalId: string;
  name: string;
  professionalId: string;
};

/** Horario libre tal como lo devuelve /api/appointments/availability. */
export type AgendaSlot = {
  date: string;
  end: string;
  endTime: string;
  professionals: AgendaSlotProfessional[];
  start: string;
  startTime: string;
};

/** Lo mínimo de un turno que necesita la agenda. */
export type AgendaAppointmentLike = {
  ownerId: string;
  rawStatus: string;
  scheduledAt: string;
};

export type DayLevel =
  | "libre"
  | "poco"
  | "lleno"
  | "sin_atencion"
  | "feriado"
  | "pasado";

export type DaySummary = {
  appointmentCount: number;
  date: string;
  freeCount: number;
  level: DayLevel;
};

/** Hasta este número de horarios libres el día se muestra como "poco lugar". */
export const FEW_SLOTS_THRESHOLD = 3;

export const dayLevelLabels: Record<DayLevel, string> = {
  feriado: "Feriado",
  libre: "Con lugar",
  lleno: "Completo",
  pasado: "Pasado",
  poco: "Poco lugar",
  sin_atencion: "Sin atención",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM-DD" del primer día del mes (month 0-11). */
export function monthStartValue(year: number, month: number) {
  return `${year}-${pad(month + 1)}-01`;
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function monthDateValues(year: number, month: number) {
  return Array.from(
    { length: daysInMonth(year, month) },
    (_, index) => `${year}-${pad(month + 1)}-${pad(index + 1)}`,
  );
}

/** Mes anterior / siguiente: { year, month }. */
export function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month + delta, 1));

  return { month: date.getUTCMonth(), year: date.getUTCFullYear() };
}

/** Día de la semana (0 = domingo) de una fecha "YYYY-MM-DD". */
export function weekdayOf(dateValue: string) {
  return new Date(`${dateValue}T12:00:00Z`).getUTCDay();
}

/**
 * Grilla del mes con semanas de lunes a domingo: null en los huecos antes del
 * día 1 y después del último día.
 */
export function buildMonthGrid(year: number, month: number) {
  const dates = monthDateValues(year, month);
  const leading = (weekdayOf(dates[0]) + 6) % 7;
  const cells: Array<string | null> = [
    ...Array.from({ length: leading }, () => null),
    ...dates,
  ];

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

/** Rango a pedir al endpoint de disponibilidad (desde hoy si el mes ya empezó), o null si el mes ya pasó. */
export function availabilityRange(year: number, month: number, today: string) {
  const dates = monthDateValues(year, month);
  const from = dates[0] < today ? today : dates[0];
  const to = dates[dates.length - 1];

  return from > to ? null : { from, to };
}

/**
 * Los cancelados liberan el horario y no se muestran. "rescheduled" es un
 * turno vigente (reprogramar lo mueve en el lugar).
 */
export function isVisibleAgendaAppointment(appointment: AgendaAppointmentLike) {
  return appointment.rawStatus !== "cancelled";
}

/** Horarios libres que todavía no empezaron. */
export function upcomingSlots<Slot extends AgendaSlot>(slots: Slot[], now: Date) {
  return slots.filter((slot) => new Date(slot.start).getTime() > now.getTime());
}

export function summarizeDays(params: {
  appointmentDates: string[];
  dates: string[];
  holidays: string[];
  slots: AgendaSlot[];
  today: string;
}): Map<string, DaySummary> {
  const freeByDate = new Map<string, number>();
  const appointmentsByDate = new Map<string, number>();
  const holidays = new Set(params.holidays);

  for (const slot of params.slots) {
    freeByDate.set(slot.date, (freeByDate.get(slot.date) ?? 0) + 1);
  }

  for (const date of params.appointmentDates) {
    appointmentsByDate.set(date, (appointmentsByDate.get(date) ?? 0) + 1);
  }

  return new Map(
    params.dates.map((date) => {
      const freeCount = freeByDate.get(date) ?? 0;
      const appointmentCount = appointmentsByDate.get(date) ?? 0;
      let level: DayLevel;

      if (date < params.today) {
        level = "pasado";
      } else if (freeCount > FEW_SLOTS_THRESHOLD) {
        level = "libre";
      } else if (freeCount > 0) {
        level = "poco";
      } else if (holidays.has(date) && appointmentCount === 0) {
        level = "feriado";
      } else if (appointmentCount > 0) {
        level = "lleno";
      } else {
        level = "sin_atencion";
      }

      return [date, { appointmentCount, date, freeCount, level }];
    }),
  );
}

export type DayRow<Appointment> =
  | { appointment: Appointment; kind: "busy"; time: string; sortKey: number }
  | { kind: "free"; slot: AgendaSlot; time: string; sortKey: number };

/**
 * Lista del día: turnos dados y horarios libres ordenados por hora; a la
 * misma hora, primero los turnos dados.
 */
export function buildDayRows<Appointment extends AgendaAppointmentLike & { time: string }>(
  appointments: Appointment[],
  slots: AgendaSlot[],
): Array<DayRow<Appointment>> {
  const rows: Array<DayRow<Appointment>> = [
    ...appointments.map((appointment) => ({
      appointment,
      kind: "busy" as const,
      sortKey: new Date(appointment.scheduledAt).getTime(),
      time: appointment.time,
    })),
    ...slots.map((slot) => ({
      kind: "free" as const,
      slot,
      sortKey: new Date(slot.start).getTime(),
      time: slot.startTime,
    })),
  ];

  return rows.sort(
    (left, right) =>
      left.sortKey - right.sortKey ||
      (left.kind === right.kind ? 0 : left.kind === "busy" ? -1 : 1),
  );
}

/** Normaliza para buscar: minúsculas y sin tildes. */
function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Busca pacientes por nombre (todas las palabras, en cualquier orden), DNI o
 * teléfono (comparando solo los dígitos, desde 3).
 */
export function searchPatients<Patient extends { document: string; name: string; phone: string }>(
  patients: Patient[],
  query: string,
  limit = 6,
) {
  const text = normalizeSearch(query);

  if (!text) {
    return [];
  }

  const digits = query.replace(/\D/g, "");
  const words = text.split(/\s+/);
  const matches = patients.filter((patient) => {
    if (digits.length >= 3 && digits.length === query.replace(/[\s.\-+()]/g, "").length) {
      return (
        patient.document.replace(/\D/g, "").includes(digits) ||
        patient.phone.replace(/\D/g, "").includes(digits)
      );
    }

    const name = normalizeSearch(patient.name);

    return words.every((word) => name.includes(word));
  });

  return matches.slice(0, limit);
}
