"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { isStaffMembership } from "@/lib/workspace-permissions";

type ClinicProfessionalAccessRow = {
  can_view_assigned_patients: boolean;
};

type ScopedQuery = {
  eq: (column: string, value: unknown) => ScopedQuery;
  is: (column: string, value: null) => ScopedQuery;
};

/**
 * Pacientes activos del espacio (para el aviso de límite del plan del Inicio).
 * El resto de los indicadores sale de la RPC get_dashboard_home
 * (useDashboardHome), así que acá queda una sola consulta `count`.
 */
export function useDashboardSummary() {
  const { activeWorkspace, error: workspaceError, loaded: workspaceLoaded } =
    useActiveWorkspace();
  const { user } = useRequireAuth();
  const [activePatientCount, setActivePatientCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!workspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      if (workspaceError) {
        setError(workspaceError);
        setActivePatientCount(0);
        return;
      }

      if (!activeWorkspace?.id || !user?.id) {
        setError("No encontramos un espacio de trabajo activo.");
        setActivePatientCount(0);
        return;
      }

      const supabase = getSupabaseClient();
      const userId = user.id;
      const workspaceId = activeWorkspace.id;

      if (activeWorkspace.type === "CLINICA" && activeWorkspace.role === "KINESIOLOGO") {
        if (!activeWorkspace.sourceClinicId) {
          setActivePatientCount(0);
          return;
        }

        const { data, error: accessError } = await supabase
          .from("clinic_professionals")
          .select("can_view_assigned_patients")
          .eq("clinic_id", activeWorkspace.sourceClinicId)
          .eq("professional_id", userId)
          .eq("status", "active")
          .maybeSingle();

        if (accessError) {
          throw new Error(mapSupabaseError(accessError));
        }

        if (
          !(data as ClinicProfessionalAccessRow | null)?.can_view_assigned_patients
        ) {
          setActivePatientCount(0);
          return;
        }
      }

      let query = supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("status", "active") as unknown as ScopedQuery;

      query = query.eq("workspace_id", workspaceId);

      if (activeWorkspace.type === "PERSONAL") {
        query = query.eq("owner_id", userId).is("clinic_id", null);
      } else if (isStaffMembership(activeWorkspace.role, activeWorkspace.type)) {
        query = query.eq("clinic_id", activeWorkspace.sourceClinicId ?? "");
      } else {
        query = query
          .eq("clinic_id", activeWorkspace.sourceClinicId ?? "")
          .eq("assigned_professional_id", userId);
      }

      const { count, error: countError } = (await query) as unknown as {
        count: number | null;
        error: unknown;
      };

      if (countError) {
        throw new Error(mapSupabaseError(countError));
      }

      setActivePatientCount(count ?? 0);
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar el dashboard."),
      );
      setActivePatientCount(0);
    } finally {
      setLoaded(true);
    }
  }, [
    activeWorkspace?.id,
    activeWorkspace?.role,
    activeWorkspace?.sourceClinicId,
    activeWorkspace?.type,
    user?.id,
    workspaceError,
    workspaceLoaded,
  ]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return {
    activePatientCount,
    error,
    loaded,
    refreshDashboardSummary: loadSummary,
  };
}
