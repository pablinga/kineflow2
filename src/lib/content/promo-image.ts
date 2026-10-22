// Piezas "promo" para redes, servidas en una URL pública (/social/<id>.jpg)
// para que Metricool (o cualquier programador) las tome sin subir archivos.
// La definición vive en public.social_images (solo service role); acá está
// la parte pura: validar los campos y armar el calendario de la serie.
// Sin dependencias de Next ni de Node: se prueba con node --test.

export const PROMO_VISUALS = ["perfil", "reservas", "serie", "ninguno"] as const;
export type PromoVisual = (typeof PROMO_VISUALS)[number];

export type PromoPerfil = {
  chips: string[];
  name: string;
  place: string;
  selected: number;
  slots: string[];
};

export type PromoReservas = {
  confirmText: string;
  confirmTitle: string;
  day: string;
  selected: number;
  slots: string[];
};

export type PromoSerie = {
  count: number;
  holidays: number[];
  label: string;
  month: number;
  monthName: string;
  /** 0 = lunes ... 6 = domingo */
  weekdays: number[];
  year: number;
};

export type PromoFields = {
  cta: string;
  eyebrow: string;
  highlight: string;
  perfil?: PromoPerfil;
  reservas?: PromoReservas;
  serie?: PromoSerie;
  subtitle: string;
  title: string;
  visual: PromoVisual;
};

export type CalendarCell =
  | { kind: "blank" }
  | { day: number; kind: "day" | "holiday" | "session" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** "<uuid>.jpg" → uuid en minúsculas; cualquier otra cosa → null. */
export function parseSocialImageFile(file: string): string | null {
  const match = /^([0-9a-f-]{36})\.jpg$/i.exec(file);

  if (!match || !UUID_RE.test(match[1])) return null;
  return match[1].toLowerCase();
}

function text(value: unknown, max: number, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => text(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function int(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Normaliza los campos guardados en la base. Recorta textos largos en vez de
 * fallar (la imagen se genera igual) y devuelve null solo si falta el título.
 */
export function normalizePromoFields(raw: unknown): PromoFields | null {
  const source = record(raw);
  const title = text(source.title, 60);

  if (!title) return null;

  const visual = PROMO_VISUALS.includes(source.visual as PromoVisual) ? (source.visual as PromoVisual) : "ninguno";
  const fields: PromoFields = {
    cta: text(source.cta, 40, "Gratis 3 meses"),
    eyebrow: text(source.eyebrow, 40),
    highlight: text(source.highlight, 40),
    subtitle: text(source.subtitle, 160),
    title,
    visual,
  };

  if (visual === "perfil") {
    const perfil = record(source.perfil);
    const slots = list(perfil.slots, 3, 12);
    fields.perfil = {
      chips: list(perfil.chips, 4, 20),
      name: text(perfil.name, 30, "Lic. Nombre Apellido"),
      place: text(perfil.place, 40),
      selected: int(perfil.selected, -1, Math.max(slots.length - 1, -1), -1),
      slots,
    };
  } else if (visual === "reservas") {
    const reservas = record(source.reservas);
    const slots = list(reservas.slots, 6, 8);
    fields.reservas = {
      confirmText: text(reservas.confirmText, 60),
      confirmTitle: text(reservas.confirmTitle, 30, "Turno confirmado"),
      day: text(reservas.day, 30),
      selected: int(reservas.selected, -1, Math.max(slots.length - 1, -1), -1),
      slots,
    };
  } else if (visual === "serie") {
    const serie = record(source.serie);
    const weekdays = Array.isArray(serie.weekdays)
      ? [...new Set(serie.weekdays.map((d) => int(d, 0, 6, -1)).filter((d) => d >= 0))].sort()
      : [];
    fields.serie = {
      count: int(serie.count, 2, 30, 10),
      holidays: Array.isArray(serie.holidays) ? serie.holidays.map((d) => int(d, 1, 31, 0)).filter(Boolean) : [],
      label: text(serie.label, 30),
      month: int(serie.month, 1, 12, 1),
      monthName: text(serie.monthName, 20),
      weekdays: weekdays.length ? weekdays : [0],
      year: int(serie.year, 2020, 2100, 2026),
    };
  }

  return fields;
}

/**
 * Grilla del mes (semanas de lunes a domingo) con las sesiones de la serie:
 * marca los días elegidos en orden, saltea feriados (marca los salteados) y corta al llegar a la
 * cantidad (si el mes no alcanza, quedan las que entran).
 */
export function buildSeriesCalendar(serie: PromoSerie): CalendarCell[] {
  const first = new Date(Date.UTC(serie.year, serie.month - 1, 1));
  const daysInMonth = new Date(Date.UTC(serie.year, serie.month, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
  const holidays = new Set(serie.holidays);
  const weekdays = new Set(serie.weekdays);
  const cells: CalendarCell[] = Array.from({ length: offset }, () => ({ kind: "blank" }));
  let sessions = 0;

  for (let day = 1; day <= daysInMonth; day += 1) {
    const weekday = (offset + day - 1) % 7;

    const inSeries = weekdays.has(weekday) && sessions < serie.count;

    if (inSeries && holidays.has(day)) {
      // Solo se marca el feriado que la serie tuvo que saltear.
      cells.push({ day, kind: "holiday" });
    } else if (inSeries) {
      sessions += 1;
      cells.push({ day, kind: "session" });
    } else {
      cells.push({ day, kind: "day" });
    }
  }

  while (cells.length % 7 !== 0) cells.push({ kind: "blank" });
  return cells;
}
