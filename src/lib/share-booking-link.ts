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
