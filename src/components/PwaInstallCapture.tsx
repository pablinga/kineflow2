"use client";

import { useEffect } from "react";
import { initPwaInstall } from "@/lib/pwa-install";

// Se registra apenas carga el bundle del cliente (antes de hidratar) para no
// perder un beforeinstallprompt temprano.
if (typeof window !== "undefined") {
  initPwaInstall();
}

/** Captura el evento de instalación en todas las páginas (layout raíz). */
export function PwaInstallCapture() {
  useEffect(() => {
    initPwaInstall();
  }, []);

  return null;
}
