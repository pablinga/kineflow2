"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { toArgentinaDateValue } from "@/lib/dates";

export type EvaluationOnset =
  | "traumatico"
  | "insidioso"
  | "post_quirurgico"
  | "sobreuso"
  | "otro";

export const EVALUATION_ONSET_OPTIONS: Array<{ label: string; value: EvaluationOnset }> = [
  { label: "Traumático", value: "traumatico" },
  { label: "Insidioso", value: "insidioso" },
  { label: "Post-quirúrgico", value: "post_quirurgico" },
  { label: "Sobreuso", value: "sobreuso" },
  { label: "Otro", value: "otro" },
];

export function getOnsetLabel(onset: EvaluationOnset | null) {
  return EVALUATION_ONSET_OPTIONS.find((option) => option.value === onset)?.label ?? "";
}

export type PatientEvaluation = {
  date: string;
  examFindings: string;
  goals: string;
  id: string;
  kinesicDiagnosis: string;
  medicalDiagnosis: string;
  onset: EvaluationOnset | null;
  painLevel: number;
  painLocation: string;
  patientId: string;
  suggestedSessions: number | null;
};

export type NewEvaluationInput = {
  examFindings: string;
  goals: string;
  kinesicDiagnosis: string;
  medicalDiagnosis: string;
  onset: EvaluationOnset | "";
  painLevel: number;
  painLocation: string;
  suggestedSessions: string;
};

export function createEmptyEvaluation(): NewEvaluationInput {
  return {
    examFindings: "",
    goals: "",
    kinesicDiagnosis: "",
    medicalDiagnosis: "",
    onset: "",
    painLevel: 5,
    painLocation: "",
    suggestedSessions: "",
  };
}

/** Mensaje de error si faltan los obligatorios, o "" si está completa. */
export function validateEvaluation(input: NewEvaluationInput) {
  if (!input.painLocation.trim()) {
    return "Ingresá la localización del dolor.";
  }

  if (!input.kinesicDiagnosis.trim()) {
    return "Ingresá el diagnóstico kinésico.";
  }

  return "";
}

type EvaluationRow = {
  evaluated_at: string;
  exam_findings: string | null;
  goals: string | null;
  id: string;
  kinesic_diagnosis: string;
  medical_diagnosis: string | null;
  onset: EvaluationOnset | null;
  pain_level: number;
  pain_location: string;
  patient_id: string;
  suggested_sessions: number | null;
};

function mapEvaluation(row: EvaluationRow): PatientEvaluation {
  return {
    date: formatDate(row.evaluated_at),
    examFindings: row.exam_findings ?? "",
    goals: row.goals ?? "",
    id: row.id,
    kinesicDiagnosis: row.kinesic_diagnosis,
    medicalDiagnosis: row.medical_diagnosis ?? "",
    onset: row.onset,
    painLevel: row.pain_level,
    painLocation: row.pain_location,
    patientId: row.patient_id,
    suggestedSessions: row.suggested_sessions,
  };
}

/** Inserta una evaluación en el espacio activo. Devuelve el id. */
export async function insertPatientEvaluation(
  workspaceId: string,
  patientId: string,
  input: NewEvaluationInput,
) {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;

  if (!userId) {
    throw new Error("No pudimos identificar al usuario.");
  }

  const suggestedSessions = Number(input.suggestedSessions);
  const { data, error } = await supabase
    .from("patient_evaluations")
    .insert({
      evaluated_at: toArgentinaDateValue(),
      exam_findings: input.examFindings.trim() || null,
      goals: input.goals.trim() || null,
      kinesic_diagnosis: input.kinesicDiagnosis.trim(),
      medical_diagnosis: input.medicalDiagnosis.trim() || null,
      onset: input.onset || null,
      owner_id: userId,
      pain_level: input.painLevel,
      pain_location: input.painLocation.trim(),
      patient_id: patientId,
      suggested_sessions:
        Number.isInteger(suggestedSessions) && suggestedSessions > 0
          ? suggestedSessions
          : null,
      workspace_id: workspaceId,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(mapSupabaseError(error));
  }

  return (data as { id: string }).id;
}

export function usePatientEvaluations(patientId: string) {
  const { activeWorkspace, loaded: activeWorkspaceLoaded } = useActiveWorkspace();
  const [evaluations, setEvaluations] = useState<PatientEvaluation[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadEvaluations = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    if (!activeWorkspace?.id || !patientId) {
      setEvaluations([]);
      setLoaded(true);
      return;
    }

    setError("");

    try {
      const { data, error: queryError } = await getSupabaseClient()
        .from("patient_evaluations")
        .select(
          "id, patient_id, evaluated_at, pain_level, pain_location, onset, medical_diagnosis, exam_findings, kinesic_diagnosis, goals, suggested_sessions",
        )
        .eq("workspace_id", activeWorkspace.id)
        .eq("patient_id", patientId)
        .order("evaluated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(mapSupabaseError(queryError));
        return;
      }

      setEvaluations(((data ?? []) as EvaluationRow[]).map(mapEvaluation));
    } catch (loadError) {
      setError(getFriendlyErrorMessage(loadError, "No pudimos cargar las evaluaciones."));
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, activeWorkspaceLoaded, patientId]);

  useEffect(() => {
    void loadEvaluations();
  }, [loadEvaluations]);

  async function addEvaluation(input: NewEvaluationInput) {
    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    const id = await insertPatientEvaluation(activeWorkspace.id, patientId, input);
    await loadEvaluations();
    return id;
  }

  return { addEvaluation, error, evaluations, loaded, refreshEvaluations: loadEvaluations };
}
