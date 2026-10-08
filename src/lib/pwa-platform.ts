/**
 * Detección de plataforma para instalar KineFlow como PWA.
 *
 * Lógica pura (sin window): recibe el userAgent y las capacidades del
 * navegador como parámetros, así la comparten el cliente y los tests. La
 * lectura de window y el evento beforeinstallprompt están en pwa-install.ts.
 */

export type InstallPlatform =
  | "android"
  | "ios-safari"
  | "ios-other"
  | "in-app"
  | "desktop"
  | "unsupported";

export type IosBrowser = "safari" | "chrome" | "edge" | "firefox" | "other";

export type PlatformInput = {
  userAgent: string;
  /** navigator.maxTouchPoints (iPadOS se identifica como Mac de escritorio). */
  maxTouchPoints?: number;
  /** matchMedia("(pointer: coarse)").matches: el puntero principal es táctil. */
  coarsePointer?: boolean;
};

export type StandaloneInput = {
  /** matchMedia("(display-mode: standalone)").matches */
  displayModeStandalone: boolean;
  /** navigator.standalone (solo existe en iOS). */
  navigatorStandalone?: boolean;
};

/** Plataformas en las que se ofrece el botón permanente "Instalar KineFlow". */
export const MOBILE_INSTALL_PLATFORMS: readonly InstallPlatform[] = [
  "android",
  "ios-safari",
  "ios-other",
  "in-app",
];

/** Navegadores internos de Instagram, Facebook y Messenger: no pueden instalar. */
export function isInAppBrowser(userAgent: string) {
  return /Instagram|FBAN|FBAV|FB_IAB/.test(userAgent);
}

export function isIpad({ userAgent, maxTouchPoints = 0 }: PlatformInput) {
  return (
    /iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
  );
}

export function isIosDevice(input: PlatformInput) {
  return /iPhone|iPod/.test(input.userAgent) || isIpad(input);
}

export function isAndroidDevice(userAgent: string) {
  return /Android/i.test(userAgent);
}

export function getIosBrowser(userAgent: string): IosBrowser {
  if (/CriOS/.test(userAgent)) {
    return "chrome";
  }

  if (/EdgiOS/.test(userAgent)) {
    return "edge";
  }

  if (/FxiOS/.test(userAgent)) {
    return "firefox";
  }

  // Otros navegadores de iOS (Opera, la app de Google, DuckDuckGo...) agregan
  // su propio token; Safari solo trae "Version/x Safari/y".
  if (
    /Safari/.test(userAgent) &&
    /Version\//.test(userAgent) &&
    !/OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|Brave/.test(userAgent)
  ) {
    return "safari";
  }

  return "other";
}

export function getInstallPlatform(input: PlatformInput): InstallPlatform {
  const { userAgent, coarsePointer = false } = input;

  if (isInAppBrowser(userAgent)) {
    return "in-app";
  }

  if (isIosDevice(input)) {
    return getIosBrowser(userAgent) === "safari" ? "ios-safari" : "ios-other";
  }

  if (isAndroidDevice(userAgent)) {
    return "android";
  }

  // Un dispositivo táctil que no identificamos (otro sistema móvil, o Android
  // en "modo escritorio") no recibe instrucciones que quizás no apliquen.
  return coarsePointer ? "unsupported" : "desktop";
}

export function isStandalone({
  displayModeStandalone,
  navigatorStandalone,
}: StandaloneInput) {
  return displayModeStandalone || navigatorStandalone === true;
}

export function isMobileInstallPlatform(platform: InstallPlatform) {
  return MOBILE_INSTALL_PLATFORMS.includes(platform);
}
