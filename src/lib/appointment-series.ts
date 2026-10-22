// Turnos en serie ("10 sesiones, lunes y miércoles a las 10"). Lógica pura:
// fechas candidatas según los días elegidos y selección de las que tienen
// lugar, salteando feriados y horarios ocupados hasta completar la cantidad.

export const MAX_SERIES_COUNT = 30;
export const MIN_SERIES_COUNT = 2;
/** Hasta dónde se buscan lugares para completar la serie. */
export const SERIES_SEARCH_DAYS = 180;

export type SeriesDateStatus = "ok" | "holiday" | "busy";

export type SeriesSkippedDate = { date: string; status: Exclude<SeriesDateStatus, "ok"> };

export type SeriesPlan = {
  /** Fechas a agendar, empezando por la del primer turno. */
  dates: string[];
  /** Fechas de la serie que se saltearon (feriado u ocupado). */
  skipped: SeriesSkippedDate[];
  /** true si no alcanzó el período de búsqueda para completar la cantidad. */
  incomplete: boolean;
};

function shiftDate(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function seriesWeekday(dateValue: string) {
  return new Date(`${dateValue}T12:00:00Z`).getUTCDay();
}

export function clampSeriesCount(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_SERIES_COUNT;
  }

  return Math.min(MAX_SERIES_COUNT, Math.max(MIN_SERIES_COUNT, Math.round(value)));
}

/**
 * Fechas posibles de la serie después del primer turno: los días de la semana
 * elegidos, en orden, hasta `SERIES_SEARCH_DAYS` días después del inicio.
 */
export function buildSeriesCandidates(params: { startDate: string; weekdays: number[] }) {
  const weekdays = new Set(params.weekdays);
  const candidates: string[] = [];

  if (weekdays.size === 0) {
    return candidates;
  }

  for (let offset = 1; offset <= SERIES_SEARCH_DAYS; offset += 1) {
    const date = shiftDate(params.startDate, offset);

    if (weekdays.has(seriesWeekday(date))) {
      candidates.push(date);
    }
  }

  return candidates;
}

/**
 * Elige las fechas de la serie: el primer turno (ya elegido y con lugar) y
 * después las candidatas con lugar, hasta completar `count`. Las que no tienen
 * lugar se saltean y se informan.
 */
export function planSeries(params: {
  candidates: string[];
  count: number;
  startDate: string;
  statusOf: (date: string) => SeriesDateStatus;
}): SeriesPlan {
  const count = clampSeriesCount(params.count);
  const dates = [params.startDate];
  const skipped: SeriesSkippedDate[] = [];

  for (const date of params.candidates) {
    if (dates.length >= count) {
      break;
    }

    const status = params.statusOf(date);

    if (status === "ok") {
      dates.push(date);
    } else {
      skipped.push({ date, status });
    }
  }

  return { dates, incomplete: dates.length < count, skipped };
}

/** Rangos de hasta 31 días (límite de /api/appointments/availability). */
export function splitIntoAvailabilityRanges(from: string, to: string, maxDays = 31) {
  const ranges: Array<{ from: string; to: string }> = [];
  let start = from;

  while (start <= to) {
    const candidateEnd = shiftDate(start, maxDays - 1);
    const end = candidateEnd < to ? candidateEnd : to;
    ranges.push({ from: start, to: end });
    start = shiftDate(end, 1);
  }

  return ranges;
}

/** Números de sesión de la serie si el primer turno lleva uno. */
export function seriesSessionNumbers(first: number | null | undefined, total: number) {
  return Array.from({ length: total }, (_, index) =>
    first === null || first === undefined ? null : first + index,
  );
}
