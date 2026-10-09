/**
 * Forma canónica del DNI: solo dígitos. Es la que se guarda en
 * patients.document_number y la que usa la reserva online para reconocer a un
 * paciente existente, así que todo alta o edición tiene que pasar por acá.
 * Un número de Excel como 32456789.0 queda en 32456789.
 */
export function normalizeDocumentNumber(value: unknown) {
  const text = String(value ?? "").trim();
  const withoutExcelDecimal = /^\d+\.0+$/.test(text) ? text.replace(/\.0+$/, "") : text;

  return withoutExcelDecimal.replace(/\D/g, "");
}

/** true si el DNI tiene letras, que la forma canónica descarta. */
export function documentNumberHasLetters(value: unknown) {
  return /\p{L}/u.test(String(value ?? ""));
}
