/**
 * Edad en años cumplidos a partir de la fecha de nacimiento (YYYY-MM-DD).
 * `today` también es YYYY-MM-DD (hora de Argentina: `toArgentinaDateValue()`).
 * Devuelve null si falta o no es una fecha válida / futura.
 */
export function getPatientAge(birthDate: string | null | undefined, today: string) {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate ?? "");
  const now = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);

  if (!birth || !now) {
    return null;
  }

  const [, by, bm, bd] = birth.map(Number);
  const [, ty, tm, td] = now.map(Number);
  let age = ty - by;

  if (tm < bm || (tm === bm && td < bd)) {
    age -= 1;
  }

  return age >= 0 && age <= 130 ? age : null;
}

export function formatPatientAge(age: number | null) {
  if (age === null) {
    return "";
  }

  return age === 1 ? "1 año" : `${age} años`;
}
