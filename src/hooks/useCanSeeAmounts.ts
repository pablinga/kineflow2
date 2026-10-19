"use client";

import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { isRecepcionWorkspace } from "@/lib/workspace-permissions";

/**
 * Montos (valor de la sesión, cobrado, pendiente). Recepción no los ve: puede
 * registrar que un turno se cobró, pero el monto queda el del turno.
 */
export function useCanSeeAmounts() {
  const { activeWorkspace } = useActiveWorkspace();

  return !isRecepcionWorkspace(activeWorkspace);
}
