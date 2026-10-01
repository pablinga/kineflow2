import type { PaymentType } from "@/hooks/useAppointments";

/**
 * Única regla del monto precargado de un turno (el monto sigue editable):
 * - Particular: precio del tipo de atención, o el precio sugerido del espacio.
 * - Obra social / ART: precio del prestador; si no tiene, el del tipo de
 *   atención (lo que paga la obra social es lo que se cobra).
 * Devuelve undefined cuando no hay un precio para precargar (se deja el monto
 * como está).
 */
export function getPrefilledSessionAmount(params: {
  attentionTypePrice: number | null | undefined;
  particularDefaultPrice: number;
  paymentType: PaymentType;
  providerPrice: number | null | undefined;
}): number | undefined {
  if (params.paymentType === "PARTICULAR") {
    return params.attentionTypePrice ?? params.particularDefaultPrice;
  }

  return params.providerPrice ?? params.attentionTypePrice ?? undefined;
}
