"use client";

import {
  useEffect,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { Plus, X } from "lucide-react";
import type { NewPatientInput } from "@/hooks/usePatients";
import type { NewTreatmentInput } from "@/hooks/useTreatments";

type InitialTreatmentInput = Omit<NewTreatmentInput, "patientId" | "startedAt">;

type NuevoPacienteModalProps = {
  assignedProfessionalSelect: ReactNode;
  createInitialTreatment: boolean;
  error: string;
  initialTreatment: InitialTreatmentInput;
  isOpen: boolean;
  newPatient: NewPatientInput;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleInitialTreatment: (value: boolean) => void;
  onUpdateField: (field: keyof NewPatientInput, value: string) => void;
  onUpdateInitialTreatmentField: (
    field: keyof InitialTreatmentInput,
    value: string | number,
  ) => void;
  saving: boolean;
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function NuevoPacienteModal({
  assignedProfessionalSelect,
  createInitialTreatment,
  error,
  initialTreatment,
  isOpen,
  newPatient,
  onClose,
  onSubmit,
  onToggleInitialTreatment,
  onUpdateField,
  onUpdateInitialTreatmentField,
  saving,
}: NuevoPacienteModalProps) {
  const modalRef = useRef<HTMLFormElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => firstInputRef.current?.focus(), 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modalRef.current) {
        return;
      }

      const focusableElements = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      aria-labelledby="nuevo-paciente-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <form
        className="max-h-[calc(100vh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-4 shadow-soft sm:max-h-[90vh] sm:p-5"
        onSubmit={onSubmit}
        ref={modalRef}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-ink" id="nuevo-paciente-title">
            Nuevo paciente
          </h2>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700">
            <p className="font-bold">No pudimos completar la acción</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Nombre completo
            </span>
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
              onChange={(event) => onUpdateField("name", event.target.value)}
              placeholder="Ej. Mariana López"
              ref={firstInputRef}
              required
              type="text"
              value={newPatient.name}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">DNI</span>
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
              onChange={(event) => onUpdateField("document", event.target.value)}
              placeholder="Ej. 32.456.789"
              required
              type="text"
              value={newPatient.document}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">
              Teléfono
            </span>
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
              onChange={(event) => onUpdateField("phone", event.target.value)}
              placeholder="+54 9 11 5555-5555"
              type="tel"
              value={newPatient.phone}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700">Email</span>
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
              onChange={(event) => onUpdateField("email", event.target.value)}
              placeholder="paciente@email.com"
              type="email"
              value={newPatient.email}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm font-semibold text-slate-700">
              Motivo de consulta / diagnóstico inicial
            </span>
            <input
              className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
              onChange={(event) => onUpdateField("condition", event.target.value)}
              placeholder="Ej. Lumbalgia, rehabilitación de rodilla"
              required
              type="text"
              value={newPatient.condition}
            />
          </label>
          {assignedProfessionalSelect}
        </div>

        <section className="mt-6 rounded-lg border border-ocean-100 bg-ocean-50 p-4">
          <label className="flex items-center gap-3">
            <input
              checked={createInitialTreatment}
              className="h-5 w-5 rounded border-ocean-200 text-ocean-600"
              onChange={(event) =>
                onToggleInitialTreatment(event.target.checked)
              }
              type="checkbox"
            />
            <span className="text-sm font-bold text-ink">
              Crear tratamiento inicial
            </span>
          </label>
          {createInitialTreatment ? (
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Diagnóstico
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    onUpdateInitialTreatmentField(
                      "diagnosis",
                      event.target.value,
                    )
                  }
                  required={createInitialTreatment}
                  type="text"
                  value={initialTreatment.diagnosis}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Región del cuerpo
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    onUpdateInitialTreatmentField(
                      "bodyRegion",
                      event.target.value,
                    )
                  }
                  placeholder="Columna lumbar, rodilla derecha"
                  type="text"
                  value={initialTreatment.bodyRegion}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Total de sesiones
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  min={1}
                  onChange={(event) =>
                    onUpdateInitialTreatmentField(
                      "totalSessions",
                      Number(event.target.value),
                    )
                  }
                  type="number"
                  value={initialTreatment.totalSessions}
                />
              </label>
            </div>
          ) : null}
        </section>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            <Plus className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar paciente"}
          </button>
        </div>
      </form>
    </div>
  );
}
