"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export type Evolution = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  patient: string;
  date: string;
  pain: string;
  mobility: string;
  notes: string;
};

export type NewEvolutionInput = {
  patientId: string;
  appointmentId?: string;
  sessionDate: string;
  painLevel: number;
  mobilityNotes: string;
  clinicalNotes: string;
  nextGoals: string;
};

type EvolutionRow = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  session_date: string;
  pain_level: number | null;
  mobility_notes: string | null;
  clinical_notes: string;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
};

function mapEvolution(row: EvolutionRow): Evolution {
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;

  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id,
    patient: patient?.full_name ?? "Paciente",
    date: new Date(`${row.session_date}T00:00:00`).toLocaleDateString("es-AR"),
    pain: row.pain_level === null ? "Sin dato" : `${row.pain_level}/10`,
    mobility: row.mobility_notes ?? "Sin nota de movilidad",
    notes: row.clinical_notes,
  };
}

export function useEvolutions(patientId?: string) {
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadEvolutions = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from("evolutions")
        .select(
          "id, patient_id, appointment_id, session_date, pain_level, mobility_notes, clinical_notes, patients(full_name)",
        )
        .order("session_date", { ascending: false });

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setEvolutions(((data ?? []) as unknown as EvolutionRow[]).map(mapEvolution));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No pudimos cargar evoluciones.",
      );
    } finally {
      setLoaded(true);
    }
  }, [patientId]);

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

    const { error: insertError } = await supabase.from("evolutions").insert({
      owner_id: sessionData.user.id,
      patient_id: input.patientId,
      appointment_id: input.appointmentId || null,
      session_date: input.sessionDate,
      pain_level: input.painLevel,
      mobility_notes: input.mobilityNotes,
      clinical_notes: input.clinicalNotes,
      next_goals: input.nextGoals || null,
    });

    if (insertError) {
      throw new Error(insertError.message);
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
