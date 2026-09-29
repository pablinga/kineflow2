"use client";

import { Activity, ClipboardList, Plus } from "lucide-react";
import {
  getOnsetLabel,
  type PatientEvaluation,
} from "@/hooks/usePatientEvaluations";

type EvaluationListProps = {
  /** Oculta "Crear tratamiento" (recepción o cuenta en solo lectura). */
  canCreateTreatment: boolean;
  evaluations: PatientEvaluation[];
  /** Dolor de la última evolución, para comparar con la evaluación más reciente. */
  latestEvolutionPain: string | null;
  onCreateTreatment: (evaluation: PatientEvaluation) => void;
  /** Evaluaciones que ya tienen un tratamiento creado a partir de ellas. */
  treatedEvaluationIds: Set<string>;
};

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) {
    return null;
  }

  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{value}</dd>
    </div>
  );
}

export function EvaluationList({
  canCreateTreatment,
  evaluations,
  latestEvolutionPain,
  onCreateTreatment,
  treatedEvaluationIds,
}: EvaluationListProps) {
  if (evaluations.length === 0) {
    return (
      <p className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
        Todavía no tiene evaluaciones.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {evaluations.map((evaluation, index) => {
        const hasTreatment = treatedEvaluationIds.has(evaluation.id);

        return (
          <li className="rounded-lg border border-ocean-100 p-3 sm:p-4" key={evaluation.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-500">
                  {index === evaluations.length - 1 ? "Evaluación inicial" : "Reevaluación"} ·{" "}
                  {evaluation.date}
                </p>
                <p className="mt-1 font-bold text-ink">{evaluation.kinesicDiagnosis}</p>
                <p className="text-sm text-slate-600">{evaluation.painLocation}</p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-ocean-50 px-3 py-1 text-sm font-semibold text-ocean-800 ring-1 ring-ocean-100">
                <Activity className="h-4 w-4" />
                {evaluation.painLevel}/10
              </span>
            </div>

            {index === 0 && latestEvolutionPain ? (
              <p className="mt-2 text-xs font-semibold text-slate-500">
                Dolor al evaluar {evaluation.painLevel}/10 → última sesión {latestEvolutionPain}
              </p>
            ) : null}

            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold text-ocean-800">
                Ver evaluación
              </summary>
              <dl className="mt-3 grid grid-cols-1 gap-3">
                <Detail label="Inicio" value={getOnsetLabel(evaluation.onset)} />
                <Detail label="Diagnóstico médico / derivación" value={evaluation.medicalDiagnosis} />
                <Detail label="Hallazgos del examen" value={evaluation.examFindings} />
                <Detail label="Objetivos" value={evaluation.goals} />
                <Detail
                  label="Sesiones sugeridas"
                  value={evaluation.suggestedSessions ? String(evaluation.suggestedSessions) : ""}
                />
              </dl>
            </details>

            {hasTreatment ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <ClipboardList className="h-4 w-4" />
                Tratamiento creado
              </p>
            ) : canCreateTreatment ? (
              <button
                className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                onClick={() => onCreateTreatment(evaluation)}
                type="button"
              >
                <Plus className="h-4 w-4" />
                Crear tratamiento
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
