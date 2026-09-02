"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

export type Evolution = {
  id: string;
  patientId: string;
  treatmentId: string | null;
  appointmentId: string | null;
  patient: string;
  date: string;
  pain: string;
  mobility: string;
  strength: string;
  notes: string;
  sessionDateRaw: string;
  painScore: number | null;
  mobilityScore: number | null;
  strengthScore: number | null;
};

export type NewEvolutionInput = {
  patientId: string;
  appointmentId?: string;
  sessionDate: string;
  painLevel: number;
  mobilityNotes: string;
  strengthNotes: string;
  clinicalNotes: string;
  nextGoals: string;
  treatmentId?: string;
};

type EvolutionRow = {
  id: string;
  patient_id: string;
  treatment_id: string | null;
  appointment_id: string | null;
  session_date: string;
  pain_level: number | null;
  mobility_notes: string | null;
  strength_notes: string | null;
  clinical_notes: string;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
};

function parseScore(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10 ? parsed : null;
}

function mapEvolution(row: EvolutionRow): Evolution {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;

  return {
    id: row.id,
    patientId: row.patient_id,
    treatmentId: row.treatment_id,
    appointmentId: row.appointment_id,
    patient: patient?.full_name ?? "Paciente",
    date: formatDate(row.session_date),
    pain: row.pain_level === null ? "Sin dato" : `${row.pain_level}/10`,
    mobility: row.mobility_notes ?? "Sin nota de movilidad",
    strength: row.strength_notes ?? "Sin nota de fuerza",
    notes: row.clinical_notes,
    sessionDateRaw: row.session_date,
    painScore: row.pain_level,
    mobilityScore: parseScore(row.mobility_notes),
    strengthScore: parseScore(row.strength_notes),
  };
}

export function useEvolutions(patientId?: string) {
  const {
    activeWorkspace,
    error: activeWorkspaceError,
    loaded: activeWorkspaceLoaded,
  } = useActiveWorkspace();
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadEvolutions = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      if (activeWorkspaceError) {
        setError(activeWorkspaceError);
        setEvolutions([]);
        return;
      }

      if (!activeWorkspace?.id) {
        setError("No encontramos un espacio de trabajo activo.");
        setEvolutions([]);
        return;
      }

      let query = supabase
        .from("evolutions")
        .select(
          "id, patient_id, treatment_id, appointment_id, session_date, pain_level, mobility_notes, strength_notes, clinical_notes, patients(full_name)",
        )
        .eq("workspace_id", activeWorkspace.id)
        .order("session_date", { ascending: false });

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(mapSupabaseError(queryError));
        return;
      }

      setEvolutions(((data ?? []) as unknown as EvolutionRow[]).map(mapEvolution));
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar evoluciones."),
      );
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, activeWorkspaceError, activeWorkspaceLoaded, patientId]);

  useEffect(() => {
    loadEvolutions();
  }, [loadEvolutions]);

  async function addEvolution(input: NewEvolutionInput) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    const { error: insertError } = await supabase.from("evolutions").insert({
      owner_id: sessionData.user.id,
      workspace_id: activeWorkspace.id,
      patient_id: input.patientId,
      treatment_id: input.treatmentId || null,
      appointment_id: input.appointmentId || null,
      session_date: input.sessionDate,
      pain_level: input.painLevel,
      mobility_notes: input.mobilityNotes,
      strength_notes: input.strengthNotes,
      clinical_notes: input.clinicalNotes,
      next_goals: input.nextGoals || null,
    });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadEvolutions();
  }

  return {
    addEvolution,
    error,
    evolutions,
    loaded,
    refreshEvolutions: loadEvolutions,
  };
}
