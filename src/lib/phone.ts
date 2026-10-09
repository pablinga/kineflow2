/**
 * Normalización de teléfonos a E.164: lógica pura (sin dependencias) para que
 * la usen el envío de WhatsApp, la reserva online y la edición de pacientes.
 */

function formatArgentinePhoneToE164(digits: string) {
  let nationalNumber = digits.startsWith("54") ? digits.slice(2) : digits;
  nationalNumber = nationalNumber.replace(/^0+/, "");

  if (nationalNumber.startsWith("9")) {
    return `+54${nationalNumber}`;
  }

  for (const areaCodeLength of [2, 3, 4]) {
    const hasMobilePrefix = nationalNumber.slice(
      areaCodeLength,
      areaCodeLength + 2,
    ) === "15";

    if (hasMobilePrefix && nationalNumber.length - 2 === 10) {
      return `+54${nationalNumber.slice(0, areaCodeLength)}${nationalNumber.slice(
        areaCodeLength + 2,
      )}`;
    }
  }

  if (nationalNumber.length === 10) {
    return `+54${nationalNumber}`;
  }

  return `+54${nationalNumber}`;
}

export function formatPhoneToE164(phone: string, defaultCountryCode = "+54") {
  const rawPhone = phone.trim();
  const digits = rawPhone.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  const countryCode = defaultCountryCode.startsWith("+")
    ? defaultCountryCode
    : `+${defaultCountryCode}`;
  const countryDigits = countryCode.replace(/\D/g, "");

  // Heuristica simple para telefonos argentinos frecuentes. No reemplaza a una
  // libreria completa de parsing telefonico; solo normaliza los formatos mas
  // comunes para el flujo de reservas por WhatsApp.
  if (rawPhone.startsWith("+")) {
    if (countryCode === "+54" && digits.startsWith("54")) {
      return formatArgentinePhoneToE164(digits);
    }

    return `+${digits}`;
  }

  if (countryCode === "+54" && digits.startsWith("54")) {
    return formatArgentinePhoneToE164(digits);
  }

  if (countryCode === "+54") {
    return formatArgentinePhoneToE164(digits);
  }

  return `+${countryDigits}${digits.replace(/^0+/, "")}`;
}

/**
 * true si el número cambió de verdad. Un cambio solo de formato (espacios,
 * guiones, prefijo 0 o 15) da el mismo E.164 y no cuenta como cambio.
 */
export function hasPhoneNumberChanged(
  previousPhone: string | null | undefined,
  nextPhone: string | null | undefined,
) {
  return formatPhoneToE164(previousPhone ?? "") !== formatPhoneToE164(nextPhone ?? "");
}
