"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export type TreatmentStatus =
  | "EN_CURSO"
  | "PAUSADO"
  | "FINALIZADO"
  | "ABANDONADO";

export type Treatment = {
  id: string;
  patientId: string;
  diagnosis: string;
  bodyRegion: string;
  totalSessions: number;
  usedSessions: number;
  status: TreatmentStatus;
  startedAt: string;
  endedAt: string | null;
  notes: string;
};

export type NewTreatmentInput = {
  bodyRegion: string;
  diagnosis: string;
  notes: string;
  patientId: string;
  startedAt: string;
  totalSessions: number;
};

type TreatmentRow = {
  body_region: string | null;
  diagnosis: string;
  ended_at: string | null;
  id: string;
  notes: string | null;
  patient_id: string;
  started_at: string;
  status: TreatmentStatus;
  total_sessions: number | null;
  used_sessions: number | null;
};

const statusOrder: Record<TreatmentStatus, number> = {
  EN_CURSO: 0,
  PAUSADO: 1,
  FINALIZADO: 2,
  ABANDONADO: 3,
};

function mapTreatment(row: TreatmentRow): Treatment {
  return {
    bodyRegion: row.body_region ?? "",
    diagnosis: row.diagnosis,
    endedAt: row.ended_at,
    id: row.id,
    notes: row.notes ?? "",
    patientId: row.patient_id,
    startedAt: formatDate(row.started_at),
    status: row.status,
    totalSessions: row.total_sessions ?? 10,
    usedSessions: row.used_sessions ?? 0,
  };
}

export function useTreatments(
  patientId?: string,
  options: { enabled?: boolean } = {},
) {
  const { user } = useRequireAuth();
  const {
    activeWorkspace,
    error: activeWorkspaceError,
    loaded: activeWorkspaceLoaded,
  } = useActiveWorkspace();
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const enabled = options.enabled ?? true;

  const loadTreatments = useCallback(async () => {
    if (!enabled) {
      setTreatments([]);
      setLoaded(true);
      setError("");
      return;
    }

    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();

      if (!user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      if (activeWorkspaceError) {
        setError(activeWorkspaceError);
        setTreatments([]);
        return;
      }

      if (!activeWorkspace?.id) {
        setError("No encontramos un espacio de trabajo activo.");
        setTreatments([]);
        return;
      }

      let query = supabase
        .from("treatments")
        .select(
          "id, patient_id, diagnosis, body_region, total_sessions, used_sessions, status, started_at, ended_at, notes",
        )
        .eq("workspace_id", activeWorkspace.id);

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(mapSupabaseError(queryError));
        return;
      }

      setTreatments(
        ((data ?? []) as TreatmentRow[])
          .map(mapTreatment)
          .sort(
            (left, right) =>
              statusOrder[left.status] - statusOrder[right.status] ||
              left.diagnosis.localeCompare(right.diagnosis),
          ),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar tratamientos."),
      );
    } finally {
      setLoaded(true);
    }
  }, [
    activeWorkspace?.id,
    activeWorkspaceError,
    activeWorkspaceLoaded,
    enabled,
    patientId,
    user,
  ]);

  useEffect(() => {
    loadTreatments();
  }, [loadTreatments]);

  const activeTreatments = useMemo(
    () => treatments.filter((treatment) => treatment.status === "EN_CURSO"),
    [treatments],
  );

  async function addTreatment(input: NewTreatmentInput) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    const { data: insertedTreatment, error: insertError } = await supabase
      .from("treatments")
      .insert({
        body_region: input.bodyRegion.trim() || null,
        diagnosis: input.diagnosis.trim(),
        notes: input.notes.trim() || null,
        owner_id: sessionData.user.id,
        workspace_id: activeWorkspace.id,
        patient_id: input.patientId,
        started_at: input.startedAt,
        status: "EN_CURSO",
        total_sessions: input.totalSessions || 10,
        used_sessions: 0,
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadTreatments();
    return (insertedTreatment as { id: string }).id;
  }

  async function updateTreatmentStatus(id: string, status: TreatmentStatus) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    const { error: updateError } = await supabase
      .from("treatments")
      .update({
        ended_at:
          status === "FINALIZADO" || status === "ABANDONADO"
            ? new Date().toISOString().slice(0, 10)
            : null,
        status,
      })
      .eq("workspace_id", activeWorkspace.id)
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadTreatments();
  }

  return {
    activeTreatments,
    addTreatment,
    error,
    loaded,
    refreshTreatments: loadTreatments,
    treatments,
    updateTreatmentStatus,
  };
}
