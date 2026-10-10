"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Share2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import {
  getActivationProgress,
  getFirstPendingStepId,
  type ActivationStep,
  type ActivationStepId,
} from "@/lib/activation-checklist";
import { MAX_IMPORT_ROWS } from "@/lib/patient-import";

type ActivationChecklistProps = {
  availabilityHref: string;
  bookingLink: string;
  error: string;
  /** "full": reemplaza al dashboard; "compact": tarjeta arriba del dashboard. */
  mode: "full" | "compact";
  onDismiss: () => Promise<void>;
  /** Cierra el checklist al 100% y muestra el Inicio normal. */
  onFinish: () => void;
  onLinkShared: () => Promise<void>;
  steps: ActivationStep[];
  supportWhatsAppUrl: string | null;
  /** Solo lectura / límite del plan: los botones de carga quedan deshabilitados. */
  writeBlockMessage: string | null;
};

const stepCopy: Record<
  ActivationStepId,
  { title: string; short: string; description?: string }
> = {
  account: {
    short: "Listo.",
    title: "Crear tu cuenta",
  },
  patients: {
    description: `Subí tu planilla y los cargamos todos de una vez. Hasta ${MAX_IMPORT_ROWS.toLocaleString("es-AR")} filas.`,
    short: "Importá tu planilla o cargalos a mano.",
    title: "Traé tus pacientes desde Excel",
  },
  availability: {
    description:
      "Elegí qué días y en qué horario atendés. Con eso armamos los turnos libres de tu agenda.",
    short: "Días y horarios en los que atendés.",
    title: "Configurar tus horarios",
  },
  booking_link: {
    description:
      "Tus pacientes reservan solos y reciben recordatorio por WhatsApp.",
    short: "Tus pacientes reservan solos.",
    title: "Compartir tu link de reservas",
  },
};

export function ActivationChecklist({
  availabilityHref,
  bookingLink,
  error,
  mode,
  onDismiss,
  onFinish,
  onLinkShared,
  steps,
  supportWhatsAppUrl,
  writeBlockMessage,
}: ActivationChecklistProps) {
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const progress = getActivationProgress(steps);
  const firstPendingId = getFirstPendingStepId(steps);
  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function registerShare() {
    try {
      await onLinkShared();
    } catch {
      // El link ya se compartió; si falla guardar la marca no molestamos al
      // usuario: el paso se completa igual con la primera reserva online.
    }
  }

  async function handleCopy() {
    setNotice("");
    setActionError("");

    try {
      await navigator.clipboard.writeText(bookingLink);
      setNotice("Link copiado. Pegalo en tu WhatsApp o en tu Instagram.");
      await registerShare();
    } catch {
      setActionError("No pudimos copiar el link. Copialo a mano: " + bookingLink);
    }
  }

  async function handleShare() {
    setNotice("");
    setActionError("");

    try {
      await navigator.share({
        text: "Reservá tu turno online:",
        title: "Reservá tu turno",
        url: bookingLink,
      });
      await registerShare();
    } catch (shareError) {
      // Cerrar la hoja de compartir no es un error ni cuenta como compartido.
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        return;
      }

      await handleCopy();
    }
  }

  async function handleDismiss() {
    setBusy(true);
    setActionError("");

    try {
      await onDismiss();
    } catch {
      setActionError("No pudimos ocultar la lista. Probá de nuevo.");
      setBusy(false);
    }
  }

  function renderActions(id: ActivationStepId) {
    if (id === "patients") {
      if (writeBlockMessage) {
        return (
          <p className="text-sm font-semibold text-amber-800">
            {writeBlockMessage}
          </p>
        );
      }

      return (
        <div className="flex flex-col gap-2 sm:flex-row">
          <LinkButton href="/dashboard/pacientes?importar=1">
            Importar Excel
          </LinkButton>
          <LinkButton href="/dashboard/pacientes?nuevo=1" variant="secondary">
            Cargar a mano
          </LinkButton>
        </div>
      );
    }

    if (id === "availability") {
      return <LinkButton href={availabilityHref}>Cargar horarios</LinkButton>;
    }

    if (id === "booking_link") {
      return (
        <div className="flex flex-col gap-2 sm:flex-row">
          {canShare ? (
            <Button onClick={() => void handleShare()} type="button">
              <Share2 aria-hidden className="h-4 w-4" />
              Compartir
            </Button>
          ) : null}
          <Button
            onClick={() => void handleCopy()}
            type="button"
            variant={canShare ? "secondary" : "primary"}
          >
            <Copy aria-hidden className="h-4 w-4" />
            Copiar link
          </Button>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="activation-progress-title"
        className="rounded-2xl border border-ocean-100 bg-white p-4 shadow-card sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              className="text-lg font-extrabold text-ink"
              id="activation-progress-title"
            >
              Tu consultorio está listo al {progress.percent}%
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">
              {progress.completed} de {progress.total}
            </p>
          </div>
          <button
            className="-mr-2 -mt-2 inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-ocean-50 hover:text-ink disabled:opacity-60"
            disabled={busy}
            onClick={() => void handleDismiss()}
            type="button"
          >
            Ocultar
          </button>
        </div>
        <div
          aria-label={`Progreso: ${progress.completed} de ${progress.total} pasos`}
          aria-valuemax={progress.total}
          aria-valuemin={0}
          aria-valuenow={progress.completed}
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-ocean-100"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-ocean-600 transition-[width] duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          {error}
        </p>
      ) : null}

      {firstPendingId === null ? (
        <section className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <h3 className="font-bold text-emerald-950">
            ¡Listo! Tu consultorio ya está armado.
          </h3>
          {notice ? (
            <p className="mt-1 text-sm font-semibold text-emerald-800" role="status">
              {notice}
            </p>
          ) : null}
          <Button className="mt-4" onClick={onFinish} type="button" variant="success">
            Ver mi inicio
          </Button>
        </section>
      ) : null}

      <ol className="space-y-3">
        {steps.map((step, index) => {
          const copy = stepCopy[step.id];
          const isCurrent = step.id === firstPendingId;
          // En la versión compacta solo se ve el paso que toca.
          if (mode === "compact" && !isCurrent) {
            return null;
          }

          if (isCurrent) {
            return (
              <li
                className="rounded-2xl border-2 border-ocean-500 bg-white p-4 shadow-card sm:p-5"
                key={step.id}
              >
                <div className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ocean-600 text-sm font-extrabold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-ink">{copy.title}</h3>
                    {copy.description ? (
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {copy.description}
                      </p>
                    ) : null}
                    <div className="mt-4">{renderActions(step.id)}</div>
                    {step.id === "booking_link" && notice ? (
                      <p
                        className="mt-3 text-sm font-semibold text-emerald-800"
                        role="status"
                      >
                        {notice}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          }

          return (
            <li
              className="flex min-h-11 items-center gap-3 rounded-2xl border border-ocean-100 bg-white px-4 py-3 shadow-card"
              key={step.id}
            >
              {step.done ? (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
                  <span className="sr-only">Completo:</span>
                </span>
              ) : (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ocean-50 text-sm font-bold text-ocean-800">
                  {index + 1}
                </span>
              )}
              <div className="min-w-0">
                <p
                  className={
                    step.done
                      ? "font-semibold text-slate-500 line-through"
                      : "font-semibold text-ink"
                  }
                >
                  {copy.title}
                </p>
                {step.done ? null : (
                  <p className="text-sm text-slate-600">{copy.short}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {actionError ? (
        <p className="text-sm font-semibold text-rose-700" role="alert">
          {actionError}
        </p>
      ) : null}

      {mode === "full" && firstPendingId !== null && supportWhatsAppUrl ? (
        <section className="rounded-2xl bg-ink p-5 text-white shadow-soft">
          <h2 className="text-lg font-extrabold">
            ¿Preferís que lo hagamos por vos?
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            Mandanos tu lista de pacientes por WhatsApp y te dejamos la agenda
            armada, sin costo.
          </p>
          <a
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-ocean-900 transition hover:bg-ocean-50"
            href={supportWhatsAppUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <MessageCircle aria-hidden className="h-4 w-4" />
            Escribir por WhatsApp
          </a>
        </section>
      ) : null}
    </div>
  );
}
