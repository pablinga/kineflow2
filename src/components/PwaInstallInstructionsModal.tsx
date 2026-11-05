"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Smartphone, X } from "lucide-react";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PwaInstallSteps } from "@/components/PwaInstallSteps";
import { Button } from "@/components/ui/Button";
import { getInstallInstructions } from "@/lib/pwa-install-instructions";
import type { InstallPlatform } from "@/lib/pwa-platform";

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
  const instructions = getInstallInstructions(platform, {
    maxTouchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent,
  });

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
        className="max-h-[90vh] supports-[height:100dvh]:max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
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
        <PwaInstallSteps instructions={instructions} />
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
