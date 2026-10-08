"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getIosBrowser, isIpad, type InstallPlatform } from "@/lib/pwa-platform";

type Instructions = {
  title: string;
  intro: string;
  steps: string[];
  note?: string;
  showCopyLink: boolean;
};

const DEFAULT_INTRO =
  "Instalá la app y accedé a tus pacientes y turnos directamente desde la pantalla de inicio.";
const SAFARI_FALLBACK_NOTE =
  "Necesitás iOS 16.4 o superior. Si la opción no aparece, copiá el link y abrilo en Safari.";

function getInstructions(platform: InstallPlatform): Instructions {
  const userAgent = navigator.userAgent;
  const device = isIpad({ maxTouchPoints: navigator.maxTouchPoints, userAgent })
    ? "iPad"
    : "iPhone";

  if (platform === "in-app") {
    return {
      intro:
        "Para instalar KineFlow, abrí esta página en Chrome (Android) o Safari (iPhone).",
      note: "Si no encontrás la opción, copiá el link y pegalo en Chrome o Safari.",
      showCopyLink: true,
      steps: [
        "Tocá el menú ⋯ (arriba a la derecha).",
        "Elegí \"Abrir en el navegador\" (o \"Abrir en navegador externo\").",
        "Desde Chrome o Safari, tocá de nuevo \"Instalar KineFlow\".",
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

function CopyLinkButton() {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const url = window.location.href;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={copyLink} type="button" variant="secondary">
        {status === "copied" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {status === "copied" ? "Link copiado" : "Copiar link"}
      </Button>
      {status === "failed" ? (
        <input
          aria-label="Link de KineFlow"
          className="w-full rounded-lg border border-ocean-100 bg-ocean-50 px-3 py-2 text-xs text-slate-700"
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={url}
        />
      ) : null}
    </div>
  );
}

type PwaInstallInstructionsModalProps = {
  platform: InstallPlatform;
  onClose: () => void;
};

/**
 * Instrucciones de instalación cuando el navegador no ofrece el diálogo
 * nativo. Se monta en document.body: el menú lateral usa transform y
 * confinaría un elemento fixed a su propio ancho.
 */
export function PwaInstallInstructionsModal({
  platform,
  onClose,
}: PwaInstallInstructionsModalProps) {
  const instructions = getInstructions(platform);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/50 px-4 py-6 sm:items-center"
      onClick={onClose}
    >
      <section
        aria-labelledby="pwa-install-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
              <Smartphone className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink" id="pwa-install-title">
                {instructions.title}
              </h2>
              <p className="mt-1 text-sm text-slate-600">{instructions.intro}</p>
            </div>
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-ocean-50"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="mt-5 space-y-3">
          {instructions.steps.map((step, index) => (
            <li className="flex gap-3 text-sm text-slate-700" key={step}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ocean-500 text-xs font-bold text-white">
                {index + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        {instructions.note ? (
          <p className="mt-4 rounded-lg bg-ocean-50 px-3 py-2 text-xs font-medium text-slate-600">
            {instructions.note}
          </p>
        ) : null}
        <div className="mt-5 space-y-2">
          {instructions.showCopyLink ? <CopyLinkButton /> : null}
          <Button className="w-full" onClick={onClose} type="button">
            Entendido
          </Button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
