"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  detectInstallPlatform,
  detectStandalone,
  getPwaInstallServerState,
  getPwaInstallState,
  initPwaInstall,
  subscribePwaInstall,
} from "@/lib/pwa-install";
import { isMobileInstallPlatform, type InstallPlatform } from "@/lib/pwa-platform";

/**
 * Estado de instalación de la PWA para la UI. La plataforma se detecta recién
 * en el cliente (después de montar) para no romper la hidratación.
 */
export function usePwaInstall() {
  const { canPrompt, installed } = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallState,
    getPwaInstallServerState,
  );
  const [environment, setEnvironment] = useState<{
    platform: InstallPlatform;
    standalone: boolean;
  } | null>(null);

  useEffect(() => {
    initPwaInstall();
    setEnvironment({
      platform: detectInstallPlatform(),
      standalone: detectStandalone(),
    });
  }, []);

  const platform = environment?.platform ?? "unsupported";
  const standalone = environment?.standalone ?? false;
  const ready = environment !== null;
  // Un táctil no identificado que igual ofrece instalación nativa también
  // recibe el botón.
  const showMobileEntryPoint =
    ready &&
    !standalone &&
    !installed &&
    (isMobileInstallPlatform(platform) ||
      (platform === "unsupported" && canPrompt));

  return {
    canPrompt,
    installed,
    platform,
    ready,
    showMobileEntryPoint,
    standalone,
  };
}
