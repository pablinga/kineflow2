"use client";

import { Paperclip, X } from "lucide-react";
import { BodyMapPicker } from "@/components/evaluations/BodyMap";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  EVALUATION_ONSET_OPTIONS,
  EVALUATION_STUDY_FILE_TYPES,
  type NewEvaluationInput,
} from "@/hooks/usePatientEvaluations";
import type { PatientSex } from "@/hooks/usePatients";

type EvaluationFieldsProps = {
  /** Sexo del paciente: silueta inicial del mapa corporal. */
  patientSex?: PatientSex | "";
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

type TextFieldName =
  | "anamnesis"
  | "clinicalHistory"
  | "complementaryStudies"
  | "functionalDynamic"
  | "functionalStatic"
  | "initialTreatment"
  | "physicalActivity"
  | "surgicalHistory"
  | "usualMedication";

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="border-b border-ocean-100 pb-1 text-sm font-bold uppercase tracking-wide text-ocean-800 md:col-span-2">
      {children}
    </h3>
  );
}

/** Campos de la evaluación kinésica, compartidos por el alta y la ficha. */
export function EvaluationFields({ onChange, patientSex, value }: EvaluationFieldsProps) {
  function textArea(field: TextFieldName, label: string, placeholder: string, wide = true) {
    return (
      <label className={`block ${wide ? "md:col-span-2" : ""}`}>
        <FieldLabel>{label}</FieldLabel>
        <textarea
          className={textareaClassName}
          onChange={(event) => onChange(field, event.target.value)}
          placeholder={placeholder}
          value={value[field]}
        />
      </label>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SectionTitle>Antecedentes</SectionTitle>
      <label className="block md:col-span-2">
        <FieldLabel>Diagnóstico médico / derivación</FieldLabel>
        <input
          className={inputClassName}
          onChange={(event) => onChange("medicalDiagnosis", event.target.value)}
          placeholder="Ej. Esguince grado II (Dr. Pérez)"
          type="text"
          value={value.medicalDiagnosis}
        />
      </label>
      {textArea("clinicalHistory", "Antecedentes clínicos", "Ej. Hipertensión, diabetes", false)}
      {textArea("surgicalHistory", "Antecedentes quirúrgicos", "Ej. Artroscopia de rodilla (2021)", false)}
      {textArea("usualMedication", "Medicación habitual", "Ej. Enalapril 10 mg", false)}
      {textArea("physicalActivity", "Actividad física habitual", "Ej. Fútbol 2 veces por semana", false)}

      <SectionTitle>Estudios complementarios</SectionTitle>
      {textArea("complementaryStudies", "Detalle de los estudios", "Ej. RMN de rodilla: lesión de menisco interno")}
      <div className="md:col-span-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50">
          <Paperclip className="h-4 w-4" />
          Adjuntar archivos
          <input
            accept={EVALUATION_STUDY_FILE_TYPES.join(",")}
            className="sr-only"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) {
                onChange("studyFiles", [...value.studyFiles, ...files]);
              }
            }}
            type="file"
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">PDF o imágenes, hasta 10 MB cada uno.</p>
        {value.studyFiles.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {value.studyFiles.map((file, index) => (
              <li
                className="flex items-center justify-between gap-2 rounded-lg bg-ocean-50 px-3 py-1 text-sm text-slate-700"
                key={`${file.name}-${index}`}
              >
                <span className="min-w-0 truncate">{file.name}</span>
                <button
                  aria-label={`Quitar ${file.name}`}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-white"
                  onClick={() =>
                    onChange(
                      "studyFiles",
                      value.studyFiles.filter((_, fileIndex) => fileIndex !== index),
                    )
                  }
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <SectionTitle>Anamnesis</SectionTitle>
      {textArea("anamnesis", "Motivo de consulta y relato del paciente", "Cómo empezó, qué lo agrava o alivia, tratamientos previos...")}

      <SectionTitle>Dolor y zona</SectionTitle>
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
      <div className="md:col-span-2">
        <FieldLabel required>Zona a tratar</FieldLabel>
        <BodyMapPicker
          onChange={(zones) => onChange("bodyZones", zones)}
          patientSex={patientSex}
          value={value.bodyZones}
        />
      </div>
      <label className="block md:col-span-2">
        <FieldLabel>Detalle de la zona</FieldLabel>
        <input
          className={inputClassName}
          onChange={(event) => onChange("painLocation", event.target.value)}
          placeholder="Ej. Menisco interno, post quirúrgico"
          type="text"
          value={value.painLocation}
        />
      </label>

      <SectionTitle>Evaluación funcional</SectionTitle>
      {textArea("functionalStatic", "Estática", "Postura, alineación, inspección...", false)}
      {textArea("functionalDynamic", "Dinámica", "Marcha, movilidad, fuerza, tests...", false)}

      <SectionTitle>Diagnóstico y plan</SectionTitle>
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
      {textArea("initialTreatment", "Tratamiento inicial", "Ej. Electroanalgesia, movilidad pasiva, ejercicios isométricos")}
    </div>
  );
}
