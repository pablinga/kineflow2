"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Loader2, X } from "lucide-react";

type UndoToastProps = {
  message: string;
  /** Sin onUndo el aviso solo informa (no hay nada para deshacer). */
  onUndo?: () => Promise<void>;
  onClose: () => void;
  durationMs?: number;
};

/**
 * Aviso breve después de una acción reversible, con "Deshacer". Va por encima
 * de los modales (por ejemplo, el cobro que se abre después de "Asistió") y
 * de la barra inferior en el celular.
 */
export function UndoToast({
  durationMs = 8000,
  message,
  onClose,
  onUndo,
}: UndoToastProps) {
  const [undoing, setUndoing] = useState(false);

  useEffect(() => {
    if (undoing) {
      return;
    }

    const timeout = window.setTimeout(onClose, durationMs);

    return () => window.clearTimeout(timeout);
  }, [durationMs, message, onClose, undoing]);

  async function handleUndo() {
    if (!onUndo) {
      return;
    }

    setUndoing(true);

    try {
      await onUndo();
    } finally {
      setUndoing(false);
      onClose();
    }
  }

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 lg:bottom-6"
      role="status"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-soft">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
        <p className="min-w-0 flex-1 font-medium">{message}</p>
        {onUndo ? (
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 font-bold text-ocean-200 transition hover:bg-white/10 disabled:opacity-70"
            disabled={undoing}
            onClick={handleUndo}
            type="button"
          >
            {undoing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Deshacer
          </button>
        ) : null}
        <button
          aria-label="Cerrar aviso"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
