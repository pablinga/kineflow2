"use client";

import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import { EvaluationFields } from "@/components/evaluations/EvaluationFields";
import { Alert } from "@/components/ui/Alert";
import {
  createEmptyEvaluation,
  validateEvaluation,
  type NewEvaluationInput,
} from "@/hooks/usePatientEvaluations";
import { getFriendlyErrorMessage } from "@/lib/error-messages";

type EvaluationModalProps = {
  onClose: () => void;
  onSave: (input: NewEvaluationInput) => Promise<void>;
  patientName: string;
};

export function EvaluationModal({ onClose, onSave, patientName }: EvaluationModalProps) {
  const [evaluation, setEvaluation] = useState<NewEvaluationInput>(createEmptyEvaluation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField<Field extends keyof NewEvaluationInput>(
    field: Field,
    value: NewEvaluationInput[Field],
  ) {
    setEvaluation((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateEvaluation(evaluation);

    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSave(evaluation);
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, "No pudimos guardar la evaluación."));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-ink/60 px-3 pb-3 sm:items-center sm:justify-center sm:px-4 sm:py-6">
      <form
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-ocean-100 bg-white p-4 shadow-soft sm:rounded-lg sm:p-5"
        onSubmit={handleSubmit}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200 sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Nueva evaluación</h2>
            <p className="mt-1 text-sm text-slate-500">{patientName}</p>
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <Alert className="mt-4" tone="error">
            {error}
          </Alert>
        ) : null}

        <div className="mt-4">
          <EvaluationFields onChange={updateField} value={evaluation} />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Guardando..." : "Guardar evaluación"}
          </button>
        </div>
      </form>
    </div>
  );
}
