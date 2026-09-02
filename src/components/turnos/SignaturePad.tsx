"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";

type Props = {
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void>;
  patientName: string;
};

export function SignaturePad({ onCancel, onSave, patientName }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function getContext() {
    const canvas = canvasRef.current;
    return canvas?.getContext("2d") ?? null;
  }

  function getPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext();
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = getContext();
    if (!ctx) return;
    const { x, y } = getPoint(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0D1B2A";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function handlePointerUp() {
    drawingRef.current = false;
  }

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    setSaving(true);
    setError("");

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setError("No pudimos procesar la firma.");
        setSaving(false);
        return;
      }

      try {
        await onSave(blob);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "No pudimos guardar la firma.",
        );
      } finally {
        setSaving(false);
      }
    }, "image/png");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Firma de {patientName}</h2>
          <button
            aria-label="Cerrar"
            className="text-slate-400 hover:text-slate-600"
            onClick={onCancel}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1 text-sm text-slate-500">
          Pasale el dispositivo al paciente para que firme abajo.
        </p>

        <canvas
          className="mt-4 w-full touch-none rounded-lg border border-ocean-100 bg-slate-50"
          height={220}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          ref={canvasRef}
          width={440}
        />

        {error ? (
          <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-between gap-2">
          <button
            className="rounded-lg border border-ocean-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            onClick={handleClear}
            type="button"
          >
            Limpiar
          </button>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-ocean-100 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              onClick={onCancel}
              type="button"
            >
              Cancelar
            </button>
            <button
              className="rounded-lg bg-ocean-600 px-4 py-2 text-sm font-semibold text-white hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!hasSignature || saving}
              onClick={handleSave}
              type="button"
            >
              {saving ? "Guardando..." : "Guardar firma"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
