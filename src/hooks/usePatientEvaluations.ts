"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { toArgentinaDateValue } from "@/lib/dates";
import { buildPainLocationText, normalizeBodyZones } from "@/lib/body-zones";

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

/** Archivo de "Estudios complementarios" (bucket privado `estudios-complementarios`). */
export type EvaluationStudyFile = {
  name: string;
  path: string;
};

/** Campos de historia clínica de la evaluación inicial (todos opcionales). */
export type EvaluationClinicalHistory = {
  anamnesis: string;
  clinicalHistory: string;
  complementaryStudies: string;
  functionalDynamic: string;
  functionalStatic: string;
  initialTreatment: string;
  physicalActivity: string;
  surgicalHistory: string;
  usualMedication: string;
};

export type PatientEvaluation = EvaluationClinicalHistory & {
  /** Claves de `src/lib/body-zones.ts`; vacío en las evaluaciones anteriores al mapa. */
  bodyZones: string[];
  date: string;
  /** Solo evaluaciones anteriores al 2026-11-03 (reemplazado por evaluación funcional). */
  examFindings: string;
  goals: string;
  id: string;
  kinesicDiagnosis: string;
  medicalDiagnosis: string;
  onset: EvaluationOnset | null;
  ownerId: string;
  painLevel: number;
  /** Zonas marcadas y detalle, como texto (ver `buildPainLocationText`). */
  painLocation: string;
  patientId: string;
  studyFiles: EvaluationStudyFile[];
  suggestedSessions: number | null;
  workspaceId: string;
};

export type NewEvaluationInput = EvaluationClinicalHistory & {
  bodyZones: string[];
  goals: string;
  kinesicDiagnosis: string;
  medicalDiagnosis: string;
  onset: EvaluationOnset | "";
  painLevel: number;
  /** Detalle libre de la zona; se guarda junto con las zonas marcadas. */
  painLocation: string;
  /** Archivos elegidos en el formulario; se suben después de guardar. */
  studyFiles: File[];
  suggestedSessions: string;
};

export const EVALUATION_STUDY_FILES_BUCKET = "estudios-complementarios";
export const EVALUATION_STUDY_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const EVALUATION_STUDY_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const EVALUATION_STUDY_FILES_MAX = 20;

/** Mensaje de error si algún archivo no se puede subir, o "". */
export function validateStudyFiles(files: File[], alreadyAttached = 0) {
  if (files.length + alreadyAttached > EVALUATION_STUDY_FILES_MAX) {
    return `Podés adjuntar hasta ${EVALUATION_STUDY_FILES_MAX} archivos por evaluación.`;
  }

  for (const file of files) {
    if (!EVALUATION_STUDY_FILE_TYPES.includes(file.type)) {
      return `"${file.name}": solo se aceptan PDF o imágenes (JPG, PNG, WEBP).`;
    }

    if (file.size > EVALUATION_STUDY_FILE_MAX_BYTES) {
      return `"${file.name}" pesa más de 10 MB.`;
    }
  }

  return "";
}

export function createEmptyEvaluation(): NewEvaluationInput {
  return {
    anamnesis: "",
    bodyZones: [],
    clinicalHistory: "",
    complementaryStudies: "",
    functionalDynamic: "",
    functionalStatic: "",
    goals: "",
    initialTreatment: "",
    kinesicDiagnosis: "",
    medicalDiagnosis: "",
    onset: "",
    painLevel: 5,
    painLocation: "",
    physicalActivity: "",
    studyFiles: [],
    suggestedSessions: "",
    surgicalHistory: "",
    usualMedication: "",
  };
}

/** Mensaje de error si faltan los obligatorios, o "" si está completa. */
export function validateEvaluation(input: NewEvaluationInput) {
  if (!buildPainLocationText(input.bodyZones, input.painLocation)) {
    return "Marcá la zona a tratar en el dibujo o escribí el detalle.";
  }

  if (!input.kinesicDiagnosis.trim()) {
    return "Ingresá el diagnóstico kinésico.";
  }

  return validateStudyFiles(input.studyFiles);
}

type EvaluationRow = {
  anamnesis: string | null;
  body_zones: string[] | null;
  clinical_history: string | null;
  complementary_studies: string | null;
  functional_dynamic: string | null;
  functional_static: string | null;
  initial_treatment: string | null;
  owner_id: string;
  physical_activity: string | null;
  study_files: unknown;
  surgical_history: string | null;
  usual_medication: string | null;
  workspace_id: string;
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

function normalizeStudyFiles(value: unknown): EvaluationStudyFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as EvaluationStudyFile).path === "string" &&
      typeof (item as EvaluationStudyFile).name === "string"
    ) {
      return [{ name: (item as EvaluationStudyFile).name, path: (item as EvaluationStudyFile).path }];
    }

    return [];
  });
}

const EVALUATION_COLUMNS =
  "id, patient_id, workspace_id, owner_id, evaluated_at, pain_level, pain_location, body_zones, onset, medical_diagnosis, exam_findings, kinesic_diagnosis, goals, suggested_sessions, clinical_history, surgical_history, usual_medication, physical_activity, complementary_studies, anamnesis, functional_static, functional_dynamic, initial_treatment, study_files";

function mapEvaluation(row: EvaluationRow): PatientEvaluation {
  return {
    anamnesis: row.anamnesis ?? "",
    bodyZones: normalizeBodyZones(row.body_zones ?? []),
    clinicalHistory: row.clinical_history ?? "",
    complementaryStudies: row.complementary_studies ?? "",
    functionalDynamic: row.functional_dynamic ?? "",
    functionalStatic: row.functional_static ?? "",
    initialTreatment: row.initial_treatment ?? "",
    ownerId: row.owner_id,
    physicalActivity: row.physical_activity ?? "",
    studyFiles: normalizeStudyFiles(row.study_files),
    surgicalHistory: row.surgical_history ?? "",
    usualMedication: row.usual_medication ?? "",
    workspaceId: row.workspace_id,
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

function textOrNull(value: string) {
  return value.trim() || null;
}

function studyFileExtension(file: File) {
  if (file.type === "application/pdf") return "pdf";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

/**
 * Sube archivos de estudios a una evaluación y los suma a `study_files`.
 * Si falla la subida de alguno, guarda los que subieron y avisa con un error.
 */
export async function attachEvaluationStudyFiles(params: {
  current: EvaluationStudyFile[];
  evaluationId: string;
  files: File[];
  workspaceId: string;
}) {
  if (params.files.length === 0) {
    return params.current;
  }

  const supabase = getSupabaseClient();
  const uploaded: EvaluationStudyFile[] = [];
  let failed = 0;

  for (const file of params.files) {
    const path = `${params.workspaceId}/${params.evaluationId}/${crypto.randomUUID()}.${studyFileExtension(file)}`;
    const { error } = await supabase.storage
      .from(EVALUATION_STUDY_FILES_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      failed += 1;
    } else {
      uploaded.push({ name: file.name.slice(0, 200), path });
    }
  }

  const next = [...params.current, ...uploaded];

  if (uploaded.length > 0) {
    const { error } = await supabase
      .from("patient_evaluations")
      .update({ study_files: next })
      .eq("id", params.evaluationId);

    if (error) {
      await supabase.storage
        .from(EVALUATION_STUDY_FILES_BUCKET)
        .remove(uploaded.map((file) => file.path));
      throw new Error(mapSupabaseError(error));
    }
  }

  if (failed > 0) {
    throw new Error(
      failed === params.files.length
        ? "No pudimos subir los archivos de estudios."
        : `No pudimos subir ${failed} de los archivos de estudios.`,
    );
  }

  return next;
}

/** Saca un archivo de estudios de la evaluación y lo borra del bucket. */
export async function removeEvaluationStudyFile(params: {
  current: EvaluationStudyFile[];
  evaluationId: string;
  path: string;
}) {
  const supabase = getSupabaseClient();
  const next = params.current.filter((file) => file.path !== params.path);
  const { error } = await supabase
    .from("patient_evaluations")
    .update({ study_files: next })
    .eq("id", params.evaluationId);

  if (error) {
    throw new Error(mapSupabaseError(error));
  }

  // Si falla, queda un archivo huérfano en el bucket privado; no se bloquea al usuario.
  await supabase.storage.from(EVALUATION_STUDY_FILES_BUCKET).remove([params.path]);
  return next;
}

/** Link temporal (5 min) para abrir un archivo de estudios. */
export async function getEvaluationStudyFileUrl(path: string) {
  const { data, error } = await getSupabaseClient()
    .storage.from(EVALUATION_STUDY_FILES_BUCKET)
    .createSignedUrl(path, 300);

  if (error || !data?.signedUrl) {
    throw new Error(error ? mapSupabaseError(error) : "No pudimos abrir el archivo.");
  }

  return data.signedUrl;
}

/**
 * Inserta una evaluación en el espacio activo y sube sus archivos de estudios.
 * Devuelve el id y, si algún archivo no subió, el aviso (la evaluación queda
 * guardada igual; los archivos se pueden adjuntar después desde la ficha).
 */
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
      anamnesis: textOrNull(input.anamnesis),
      body_zones: normalizeBodyZones(input.bodyZones),
      clinical_history: textOrNull(input.clinicalHistory),
      complementary_studies: textOrNull(input.complementaryStudies),
      evaluated_at: toArgentinaDateValue(),
      functional_dynamic: textOrNull(input.functionalDynamic),
      functional_static: textOrNull(input.functionalStatic),
      goals: input.goals.trim() || null,
      initial_treatment: textOrNull(input.initialTreatment),
      physical_activity: textOrNull(input.physicalActivity),
      surgical_history: textOrNull(input.surgicalHistory),
      usual_medication: textOrNull(input.usualMedication),
      kinesic_diagnosis: input.kinesicDiagnosis.trim(),
      medical_diagnosis: input.medicalDiagnosis.trim() || null,
      onset: input.onset || null,
      owner_id: userId,
      pain_level: input.painLevel,
      pain_location: buildPainLocationText(input.bodyZones, input.painLocation),
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

  const id = (data as { id: string }).id;
  let filesError = "";

  try {
    await attachEvaluationStudyFiles({
      current: [],
      evaluationId: id,
      files: input.studyFiles,
      workspaceId,
    });
  } catch {
    filesError =
      "La evaluación se guardó, pero no pudimos subir algunos archivos de estudios. Podés adjuntarlos desde la ficha del paciente.";
  }

  return { filesError, id };
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
        .select(EVALUATION_COLUMNS)
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

    const result = await insertPatientEvaluation(activeWorkspace.id, patientId, input);
    await loadEvaluations();
    return result;
  }

  async function addStudyFiles(evaluation: PatientEvaluation, files: File[]) {
    const validationError = validateStudyFiles(files, evaluation.studyFiles.length);

    if (validationError) {
      throw new Error(validationError);
    }

    try {
      await attachEvaluationStudyFiles({
        current: evaluation.studyFiles,
        evaluationId: evaluation.id,
        files,
        workspaceId: evaluation.workspaceId,
      });
    } finally {
      await loadEvaluations();
    }
  }

  async function removeStudyFile(evaluation: PatientEvaluation, path: string) {
    try {
      await removeEvaluationStudyFile({
        current: evaluation.studyFiles,
        evaluationId: evaluation.id,
        path,
      });
    } finally {
      await loadEvaluations();
    }
  }

  return {
    addEvaluation,
    addStudyFiles,
    error,
    evaluations,
    loaded,
    refreshEvaluations: loadEvaluations,
    removeStudyFile,
  };
}
