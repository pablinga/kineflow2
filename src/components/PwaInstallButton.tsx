"use client";

import { useCallback, useState } from "react";
import { clsx } from "clsx";
import { Loader2, Smartphone } from "lucide-react";
import { PwaInstallInstructionsModal } from "@/components/PwaInstallInstructionsModal";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { promptPwaInstall, trackPwaEvent } from "@/lib/pwa-install";

type PwaInstallButtonProps = {
  /**
   * "menu": fila del menú móvil del dashboard; "login": link secundario;
   * "install_page": botón principal de /instalar.
   */
  source: "menu" | "login" | "install_page";
  className?: string;
};

const styles = {
  install_page:
    "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-ocean-500 px-5 py-3 text-base font-semibold text-white shadow-soft transition-colors duration-150 ease-out hover:bg-ocean-600 disabled:opacity-60",
  login:
    "mx-auto flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:text-ocean-700",
  menu: "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold text-slate-600 transition-colors duration-150 ease-out hover:bg-ocean-50 hover:text-ocean-800",
};

/**
 * Acceso permanente "Instalar KineFlow" en móviles. No depende del cooldown
 * del aviso automático; se oculta si la app ya corre instalada.
 */
export function PwaInstallButton({ className, source }: PwaInstallButtonProps) {
  const { canPrompt, platform, showMobileEntryPoint } = usePwaInstall();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const closeInstructions = useCallback(() => setInstructionsOpen(false), []);

  if (!showMobileEntryPoint) {
    return null;
  }

  async function handleClick() {
    trackPwaEvent("pwa_install_click", { platform, source });

    if (!canPrompt) {
      setInstructionsOpen(true);
      return;
    }

    setPrompting(true);
    const result = await promptPwaInstall();
    setPrompting(false);

    if (result === "unavailable") {
      setInstructionsOpen(true);
    }
  }

  return (
    <>
      <button
        className={clsx(styles[source], className)}
        disabled={prompting}
        onClick={handleClick}
        type="button"
      >
        {prompting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Smartphone className="h-5 w-5" />
        )}
        Instalar KineFlow
      </button>
      {instructionsOpen ? (
        <PwaInstallInstructionsModal
          onClose={closeInstructions}
          platform={platform}
        />
      ) : null}
    </>
  );
}
