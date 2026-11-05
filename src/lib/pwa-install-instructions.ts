import { sanitizeUtmValue } from "./attribution.ts";
import { getIosBrowser, isIpad, type InstallPlatform } from "./pwa-platform.ts";

/**
 * Pasos para instalar KineFlow según la plataforma. Lógica pura (recibe el
 * userAgent): la usan el modal de instrucciones (PwaInstallInstructionsModal)
 * y la página pública /instalar, y se testea sin navegador.
 */

export type InstallInstructions = {
  title: string;
  intro: string;
  steps: string[];
  note?: string;
  showCopyLink: boolean;
};

export type InstructionsContext = {
  userAgent: string;
  /** navigator.maxTouchPoints (para reconocer un iPad con UA de Mac). */
  maxTouchPoints?: number;
};

/** Secciones fijas de /instalar, en el orden en que se muestran. */
export const INSTALL_GUIDE_SECTIONS = [
  { label: "Android (Chrome)", platform: "android" },
  { label: "iPhone o iPad (Safari)", platform: "ios-safari" },
] as const satisfies ReadonlyArray<{ label: string; platform: InstallPlatform }>;

const DEFAULT_INTRO =
  "Instalá la app y accedé a tus pacientes y turnos directamente desde la pantalla de inicio.";
const SAFARI_FALLBACK_NOTE =
  "Necesitás iOS 16.4 o superior. Si la opción no aparece, copiá el link y abrilo en Safari.";

export function getInstallInstructions(
  platform: InstallPlatform,
  { maxTouchPoints, userAgent }: InstructionsContext,
): InstallInstructions {
  const device = isIpad({ maxTouchPoints, userAgent }) ? "iPad" : "iPhone";

  if (platform === "in-app") {
    return {
      intro:
        "Para instalar KineFlow, abrí esta página en Chrome (Android) o Safari (iPhone).",
      note: "Si no encontrás la opción, copiá el link y pegalo en Chrome o Safari.",
      showCopyLink: true,
      steps: [
        "Tocá el menú ⋯ (arriba a la derecha).",
        "Elegí \"Abrir en el navegador\" (o \"Abrir en navegador externo\").",
        "Desde Chrome o Safari, seguí los pasos para instalar KineFlow.",
      ],
      title: "Abrí KineFlow en tu navegador",
    };
  }

  if (platform === "ios-safari") {
    return {
      intro: DEFAULT_INTRO,
      note: "Después abrí KineFlow desde el ícono de tu pantalla de inicio.",
      showCopyLink: false,
      steps: [
        "Abrí KineFlow en Safari.",
        `Tocá el botón Compartir (el cuadrado con una flecha hacia arriba), ${
          device === "iPad" ? "arriba a la derecha" : "en la barra de abajo"
        }. Si no lo ves, tocá ⋯ y después Compartir.`,
        "Seleccioná \"Agregar a pantalla de inicio\" (deslizá la lista hacia abajo si no aparece).",
        "Confirmá tocando \"Agregar\".",
      ],
      title: `Instalá KineFlow en tu ${device}`,
    };
  }

  if (platform === "ios-other") {
    const browser = getIosBrowser(userAgent);

    if (browser === "chrome" || browser === "edge") {
      return {
        intro: DEFAULT_INTRO,
        note: SAFARI_FALLBACK_NOTE,
        showCopyLink: true,
        steps: [
          browser === "chrome"
            ? "Tocá el botón Compartir, arriba a la derecha en la barra de direcciones."
            : "Tocá el botón Compartir (si no lo ves, abrí el menú ⋯ y elegí Compartir).",
          "Seleccioná \"Agregar a pantalla de inicio\".",
          "Confirmá tocando \"Agregar\".",
        ],
        title: `Instalá KineFlow en tu ${device}`,
      };
    }

    return {
      intro: `Desde este navegador no se puede instalar KineFlow en el ${device}. Abrí la página en Safari.`,
      showCopyLink: true,
      steps: [
        "Copiá el link de esta página.",
        "Abrí Safari y pegalo en la barra de direcciones.",
        "Tocá Compartir y elegí \"Agregar a pantalla de inicio\".",
      ],
      title: "Abrí KineFlow en Safari",
    };
  }

  return {
    intro: DEFAULT_INTRO,
    note: "Si tu navegador no muestra esa opción, copiá el link y abrilo en Chrome.",
    showCopyLink: true,
    steps: [
      "Abrí el menú del navegador: ⋮ arriba a la derecha en Chrome, o ≡ abajo en Samsung Internet.",
      "Elegí \"Instalar app\" o \"Agregar a pantalla de inicio\" (en Samsung Internet: \"Agregar página a\" → \"Pantalla de inicio\").",
      "Confirmá la instalación.",
    ],
    title: "Instalá KineFlow en tu celular",
  };
}

/**
 * De dónde llegó la visita a /instalar, para medir: `?src=` (ej. el link de la
 * bio de Instagram) o `utm_source`; si no hay, "direct". Solo slugs.
 */
export function getInstallPageSource(search: string) {
  const params = new URLSearchParams(search);
  const source =
    sanitizeUtmValue(params.get("src")) ?? sanitizeUtmValue(params.get("utm_source"));

  return source ?? "direct";
}

export type InstallGuideLayout = {
  /** Pasos de la plataforma detectada, arriba de todo (null en escritorio). */
  primary: InstallPlatform | null;
  /** Secciones fijas que se muestran debajo, sin repetir la detectada. */
  others: InstallPlatform[];
};

/** Qué pasos muestra /instalar primero según la plataforma detectada. */
export function getInstallGuideLayout(platform: InstallPlatform): InstallGuideLayout {
  const primary =
    platform === "desktop" || platform === "unsupported" ? null : platform;

  return {
    others: INSTALL_GUIDE_SECTIONS.map((section) => section.platform).filter(
      (sectionPlatform) => sectionPlatform !== primary,
    ),
    primary,
  };
}
