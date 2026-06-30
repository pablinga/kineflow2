"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

export type WorkspaceProfessional = {
  id: string;
  name: string;
  email: string;
  color: string;
};

export type PatientAssignment = {
  id: string;
  professionalId: string;
};

type MemberRow = {
  color: string | null;
  email: string;
  user_id: string | null;
  profiles:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

type AssignmentRow = {
  id: string;
  professional_id: string;
};

function getProfile(
  profile:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null,
) {
  return Array.isArray(profile) ? profile[0] : profile;
}

export function usePatientAssignments(patientId?: string) {
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [professionals, setProfessionals] = useState<WorkspaceProfessional[]>([]);
  const [assignments, setAssignments] = useState<PatientAssignment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const isClinicAdmin =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";

  const assignedProfessionalIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.professionalId)),
    [assignments],
  );

  const loadAssignments = useCallback(async () => {
    if (!workspaceLoaded) {
      return;
    }

    if (!activeWorkspace?.id || !patientId || !isClinicAdmin) {
      setProfessionals([]);
      setAssignments([]);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const [membersResult, assignmentsResult] = await Promise.all([
        supabase
          .from("workspace_members")
          .select("user_id, email, color, profiles(full_name, email)")
          .eq("workspace_id", activeWorkspace.id)
          .eq("role", "KINESIOLOGO")
          .eq("status", "accepted")
          .not("user_id", "is", null)
          .order("email", { ascending: true }),
        supabase
          .from("patient_assignments")
          .select("id, professional_id")
          .eq("workspace_id", activeWorkspace.id)
          .eq("patient_id", patientId)
          .is("ended_at", null),
      ]);

      if (membersResult.error) {
        throw new Error(mapSupabaseError(membersResult.error));
      }

      if (assignmentsResult.error) {
        throw new Error(mapSupabaseError(assignmentsResult.error));
      }

      setProfessionals(
        ((membersResult.data ?? []) as unknown as MemberRow[])
          .filter((member) => Boolean(member.user_id))
          .map((member) => {
            const profile = getProfile(member.profiles);
            const email = profile?.email ?? member.email;

            return {
              color: member.color ?? "#14b8a6",
              email,
              id: member.user_id ?? "",
              name: profile?.full_name || email,
            };
          }),
      );
      setAssignments(
        ((assignmentsResult.data ?? []) as AssignmentRow[]).map((assignment) => ({
          id: assignment.id,
          professionalId: assignment.professional_id,
        })),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar asignaciones."),
      );
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, isClinicAdmin, patientId, workspaceLoaded]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  async function assignProfessional(professionalId: string) {
    if (!activeWorkspace?.id || !patientId) {
      throw new Error("No encontramos el espacio de trabajo activo.");
    }

    const supabase = getSupabaseClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const { error: insertError } = await supabase
      .from("patient_assignments")
      .insert({
        assigned_by: userData.user.id,
        patient_id: patientId,
        professional_id: professionalId,
        workspace_id: activeWorkspace.id,
      });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadAssignments();
  }

  async function unassignProfessional(assignmentId: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("patient_assignments")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", assignmentId);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadAssignments();
  }

  return {
    assignProfessional,
    assignedProfessionalIds,
    assignments,
    error,
    isClinicAdmin,
    loaded,
    professionals,
    refreshAssignments: loadAssignments,
    unassignProfessional,
  };
}

