"use client";

import { useEffect, useState } from "react";
import { detectAndroidApp } from "@/lib/android-app";

/** true si la web corre dentro de la app de Android (ver src/lib/android-app.ts). */
export function useIsAndroidApp() {
  const [isAndroidApp, setIsAndroidApp] = useState(false);

  useEffect(() => {
    setIsAndroidApp(detectAndroidApp());
  }, []);

  return isAndroidApp;
}
