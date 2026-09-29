"use client";

import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  EVALUATION_ONSET_OPTIONS,
  type NewEvaluationInput,
} from "@/hooks/usePatientEvaluations";

type EvaluationFieldsProps = {
  onChange: <Field extends keyof NewEvaluationInput>(
    field: Field,
    value: NewEvaluationInput[Field],
  ) => void;
  value: NewEvaluationInput;
};

const inputClassName =
  "mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400";
const textareaClassName =
  "mt-2 min-h-20 w-full rounded-lg border border-ocean-100 bg-white px-4 py-3 text-sm outline-none focus:border-ocean-400";

/** Campos de la evaluación kinésica, compartidos por el alta y la ficha. */
export function EvaluationFields({ onChange, value }: EvaluationFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <label className="block">
        <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
          <FieldLabel required>Dolor (EVA)</FieldLabel>
          <span className="rounded-full bg-ocean-50 px-3 py-1 text-ocean-800">
            {value.painLevel}/10
          </span>
        </span>
        <input
          className="mt-3 w-full accent-ocean-600"
          max={10}
          min={0}
          onChange={(event) => onChange("painLevel", Number(event.target.value))}
          step={1}
          type="range"
          value={value.painLevel}
        />
      </label>
      <label className="block">
        <FieldLabel required>Localización</FieldLabel>
        <input
          className={inputClassName}
          onChange={(event) => onChange("painLocation", event.target.value)}
          placeholder="Ej. Rodilla derecha"
          required
          type="text"
          value={value.painLocation}
        />
      </label>
      <label className="block">
        <FieldLabel>Inicio</FieldLabel>
        <select
          className={inputClassName}
          onChange={(event) =>
            onChange("onset", event.target.value as NewEvaluationInput["onset"])
          }
          value={value.onset}
        >
          <option value="">Sin especificar</option>
          {EVALUATION_ONSET_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <FieldLabel>Diagnóstico médico / derivación</FieldLabel>
        <input
          className={inputClassName}
          onChange={(event) => onChange("medicalDiagnosis", event.target.value)}
          placeholder="Ej. Esguince grado II (Dr. Pérez)"
          type="text"
          value={value.medicalDiagnosis}
        />
      </label>
      <label className="block md:col-span-2">
        <FieldLabel>Hallazgos del examen</FieldLabel>
        <textarea
          className={textareaClassName}
          onChange={(event) => onChange("examFindings", event.target.value)}
          placeholder="Movilidad, fuerza, tests, palpación..."
          value={value.examFindings}
        />
      </label>
      <label className="block md:col-span-2">
        <FieldLabel required>Diagnóstico kinésico</FieldLabel>
        <input
          className={inputClassName}
          onChange={(event) => onChange("kinesicDiagnosis", event.target.value)}
          placeholder="Ej. Inestabilidad de tobillo post esguince"
          required
          type="text"
          value={value.kinesicDiagnosis}
        />
      </label>
      <label className="block">
        <FieldLabel>Objetivos</FieldLabel>
        <textarea
          className={textareaClassName}
          onChange={(event) => onChange("goals", event.target.value)}
          placeholder="Ej. Marcha sin dolor en 4 semanas"
          value={value.goals}
        />
      </label>
      <label className="block">
        <FieldLabel>Sesiones sugeridas</FieldLabel>
        <input
          className={inputClassName}
          max={200}
          min={1}
          onChange={(event) => onChange("suggestedSessions", event.target.value)}
          placeholder="Ej. 10"
          type="number"
          value={value.suggestedSessions}
        />
      </label>
    </div>
  );
}
