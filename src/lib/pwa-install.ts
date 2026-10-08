import { track } from "@vercel/analytics";
import {
  getInstallPlatform,
  isStandalone,
  type InstallPlatform,
} from "@/lib/pwa-platform";

/**
 * Store único de instalación de la PWA (solo navegador).
 *
 * Registra una sola vez los listeners de beforeinstallprompt y appinstalled y
 * guarda el evento para usarlo después. Lo comparten el aviso automático del
 * dashboard, el botón del menú móvil y el acceso del login (usePwaInstall).
 * Se inicializa desde el layout raíz para no perder el evento si el usuario
 * entra por /login o por la landing.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export type PwaInstallState = {
  /** Hay un evento beforeinstallprompt sin usar: se puede abrir el diálogo nativo. */
  canPrompt: boolean;
  /** El navegador avisó (appinstalled) que se instaló en esta visita. */
  installed: boolean;
};

export type PwaInstallResult = "accepted" | "dismissed" | "unavailable";

const SERVER_STATE: PwaInstallState = { canPrompt: false, installed: false };

let state = SERVER_STATE;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<() => void>();

function setState(next: Partial<PwaInstallState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function trackPwaEvent(
  name: "pwa_install_click" | "pwa_installed",
  properties?: Record<string, string>,
) {
  try {
    track(name, properties);
  } catch {
    // La medición nunca debe interferir con la instalación.
  }
}

export function initPwaInstall() {
  if (initialized || typeof window === "undefined") {
    return;
  }

  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    setState({ canPrompt: true });
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    setState({ canPrompt: false, installed: true });
    trackPwaEvent("pwa_installed");
  });
}

export function subscribePwaInstall(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function getPwaInstallState() {
  return state;
}

export function getPwaInstallServerState() {
  return SERVER_STATE;
}

/**
 * Abre el diálogo nativo de instalación. El evento solo se puede usar una vez:
 * se descarta siempre, así si el usuario cancela el botón pasa a mostrar las
 * instrucciones manuales. "accepted" no confirma la instalación (eso lo avisa
 * appinstalled).
 */
export async function promptPwaInstall(): Promise<PwaInstallResult> {
  const promptEvent = deferredPrompt;

  if (!promptEvent) {
    return "unavailable";
  }

  deferredPrompt = null;
  setState({ canPrompt: false });

  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;

    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

export function detectInstallPlatform(): InstallPlatform {
  return getInstallPlatform({
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  });
}

export function detectStandalone() {
  return isStandalone({
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  });
}
