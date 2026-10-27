"use client";

import { useEffect } from "react";
import { captureAndroidApp } from "@/lib/android-app";

// Antes de hidratar: el parámetro de startUrl se pierde si la página
// redirige (por ejemplo al login).
if (typeof window !== "undefined") {
  captureAndroidApp();
}

/** Marca la pestaña cuando la web corre dentro de la app de Android. */
export function AndroidAppCapture() {
  useEffect(() => {
    captureAndroidApp();
  }, []);

  return null;
}
