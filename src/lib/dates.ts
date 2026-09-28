const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

const argentinaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: ARGENTINA_TIME_ZONE,
  year: "numeric",
});

/**
 * Fecha "YYYY-MM-DD" del instante dado en hora de Argentina. Usa la zona
 * explícita, así da lo mismo en el navegador que en el servidor (Vercel
 * corre en UTC). `toISOString().slice(0, 10)` da el día siguiente entre las
 * 21:00 y las 23:59 de Argentina.
 */
export function toArgentinaDateValue(date: Date = new Date()): string {
  const values = new Map(
    argentinaDateFormatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
