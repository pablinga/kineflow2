"use client";

import { useState } from "react";
import { Activity, ClipboardList, FileText, Paperclip, Plus, Trash2 } from "lucide-react";
import { BodyMapPreview } from "@/components/evaluations/BodyMap";
import {
  EVALUATION_STUDY_FILE_TYPES,
  getEvaluationStudyFileUrl,
  getOnsetLabel,
  type PatientEvaluation,
} from "@/hooks/usePatientEvaluations";
import type { PatientSex } from "@/hooks/usePatients";
import { getFriendlyErrorMessage } from "@/lib/error-messages";

type EvaluationListProps = {
  /** Oculta "Crear tratamiento" (recepción o cuenta en solo lectura). */
  canCreateTreatment: boolean;
  /** Puede adjuntar / quitar archivos de estudios (autor de la evaluación, sin solo lectura). */
  canManageFiles: (evaluation: PatientEvaluation) => boolean;
  onAddStudyFiles: (evaluation: PatientEvaluation, files: File[]) => Promise<void>;
  onRemoveStudyFile: (evaluation: PatientEvaluation, path: string) => Promise<void>;
  /** Sexo del paciente: silueta de las miniaturas. */
  patientSex?: PatientSex | "";
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

function DetailGroup({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold uppercase tracking-wide text-ocean-800">{title}</p>
      {children}
    </div>
  );
}

function StudyFiles({
  canManage,
  evaluation,
  onAdd,
  onRemove,
}: {
  canManage: boolean;
  evaluation: PatientEvaluation;
  onAdd: (evaluation: PatientEvaluation, files: File[]) => Promise<void>;
  onRemove: (evaluation: PatientEvaluation, path: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (evaluation.studyFiles.length === 0 && !canManage) {
    return null;
  }

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(getFriendlyErrorMessage(actionError, fallback));
    } finally {
      setBusy(false);
    }
  }

  async function openFile(path: string) {
    // La pestaña se abre antes del await para que el navegador no la bloquee.
    const tab = window.open("", "_blank");
    try {
      const url = await getEvaluationStudyFileUrl(path);
      if (tab) {
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (openError) {
      tab?.close();
      setError(getFriendlyErrorMessage(openError, "No pudimos abrir el archivo."));
    }
  }

  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Archivos de estudios
      </dt>
      <dd className="mt-1">
        {evaluation.studyFiles.length > 0 ? (
          <ul className="space-y-1">
            {evaluation.studyFiles.map((file) => (
              <li className="flex items-center gap-1" key={file.path}>
                <button
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm font-semibold text-ocean-800 hover:bg-ocean-50"
                  onClick={() => void openFile(file.path)}
                  type="button"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{file.name}</span>
                </button>
                {canManage ? (
                  <button
                    aria-label={`Eliminar ${file.name}`}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar "${file.name}"?`)) {
                        void run(() => onRemove(evaluation, file.path), "No pudimos eliminar el archivo.");
                      }
                    }}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canManage ? (
          <label
            className={`mt-1 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 ${
              busy ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <Paperclip className="h-4 w-4" />
            {busy ? "Subiendo..." : "Adjuntar archivos"}
            <input
              accept={EVALUATION_STUDY_FILE_TYPES.join(",")}
              className="sr-only"
              disabled={busy}
              multiple
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) {
                  void run(() => onAdd(evaluation, files), "No pudimos subir los archivos.");
                }
              }}
              type="file"
            />
          </label>
        ) : null}
        {error ? <p className="mt-1 text-sm font-semibold text-red-700">{error}</p> : null}
      </dd>
    </div>
  );
}

export function EvaluationList({
  canCreateTreatment,
  canManageFiles,
  evaluations,
  latestEvolutionPain,
  onAddStudyFiles,
  onCreateTreatment,
  onRemoveStudyFile,
  patientSex,
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

            {evaluation.bodyZones.length > 0 ? (
              <div className="mt-3">
                <BodyMapPreview patientSex={patientSex} zones={evaluation.bodyZones} />
              </div>
            ) : null}

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
                <Detail label="Diagnóstico médico / derivación" value={evaluation.medicalDiagnosis} />
                <Detail label="Antecedentes clínicos" value={evaluation.clinicalHistory} />
                <Detail label="Antecedentes quirúrgicos" value={evaluation.surgicalHistory} />
                <Detail label="Medicación habitual" value={evaluation.usualMedication} />
                <Detail label="Actividad física habitual" value={evaluation.physicalActivity} />
                <Detail label="Estudios complementarios" value={evaluation.complementaryStudies} />
                <StudyFiles
                  canManage={canManageFiles(evaluation)}
                  evaluation={evaluation}
                  onAdd={onAddStudyFiles}
                  onRemove={onRemoveStudyFile}
                />
                <Detail label="Anamnesis" value={evaluation.anamnesis} />
                <Detail label="Inicio" value={getOnsetLabel(evaluation.onset)} />
                {evaluation.functionalStatic || evaluation.functionalDynamic ? (
                  <DetailGroup title="Evaluación funcional">
                    <Detail label="Estática" value={evaluation.functionalStatic} />
                    <Detail label="Dinámica" value={evaluation.functionalDynamic} />
                  </DetailGroup>
                ) : null}
                <Detail label="Hallazgos del examen" value={evaluation.examFindings} />
                <Detail label="Tratamiento inicial" value={evaluation.initialTreatment} />
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
