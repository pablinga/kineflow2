"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";

type CopyLinkButtonProps = {
  className?: string;
  /** Se llama después de copiar (por ejemplo, para medir). */
  onCopied?: () => void;
};

/**
 * Copia el link de la página actual. Si el portapapeles no está disponible
 * (navegadores internos de Instagram/Facebook), muestra el link para
 * seleccionarlo a mano. Renderizar solo en el cliente: lee window.location.
 */
export function CopyLinkButton({ className = "w-full", onCopied }: CopyLinkButtonProps) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const url = window.location.href;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
      onCopied?.();
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div className="space-y-2">
      <Button className={className} onClick={copyLink} type="button" variant="secondary">
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
