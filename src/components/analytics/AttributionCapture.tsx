"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  captureAttributionFromLocation,
  trackAcquisitionEvent,
} from "@/lib/attribution-client";

/**
 * Captura los UTM en la primera visita (first touch) y registra landing_view.
 * Corre en todas las páginas; si no hay UTM ni atribución previa no hace nada.
 */
export function AttributionCapture() {
  const pathname = usePathname();

  useEffect(() => {
    const attribution = captureAttributionFromLocation();

    if (attribution) {
      trackAcquisitionEvent("landing_view");
    }
  }, [pathname]);

  return null;
}
