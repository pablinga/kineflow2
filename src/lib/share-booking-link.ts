// Compartir el link público de reservas: hoja nativa (Web Share API) si
// existe y, si no, copiar al portapapeles. Lo usan el checklist y "Hoy".

export type ShareBookingLinkResult = "shared" | "copied" | "cancelled";

export function canUseWebShare() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function copyBookingLink(link: string): Promise<"copied"> {
  await navigator.clipboard.writeText(link);

  return "copied";
}

/** Lanza error solo si tampoco se pudo copiar. */
export async function shareBookingLink(
  link: string,
): Promise<ShareBookingLinkResult> {
  if (!canUseWebShare()) {
    return copyBookingLink(link);
  }

  try {
    await navigator.share({
      text: "Reservá tu turno online:",
      title: "Reservá tu turno",
      url: link,
    });

    return "shared";
  } catch (shareError) {
    // Cerrar la hoja de compartir no es un error ni cuenta como compartido.
    if (shareError instanceof DOMException && shareError.name === "AbortError") {
      return "cancelled";
    }

    return copyBookingLink(link);
  }
}

/** Mensaje para compartir el link de reservas (WhatsApp u otras apps). */
export function getBookingShareMessage(params: {
  link: string;
  /** Nombre de la clínica; para un particular se omite (habla en primera persona). */
  clinicName?: string | null;
}) {
  const clinicName = params.clinicName?.trim();

  return clinicName
    ? `Reservá tu turno en ${clinicName} online, eligiendo el día y horario que te quede cómodo: ${params.link}`
    : `Reservá tu turno conmigo online, eligiendo el día y horario que te quede cómodo: ${params.link}`;
}

/**
 * Link de WhatsApp para compartir un texto: abre la app en el celular (o
 * WhatsApp Web en la computadora) para elegir el chat o el estado.
 */
export function getWhatsAppShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
