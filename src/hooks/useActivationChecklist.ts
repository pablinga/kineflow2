"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import type { ActivationFacts } from "@/lib/activation-checklist";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type ProfileChecklistRow = {
  activation_checklist_dismissed_at: string | null;
  booking_link_shared_at: string | null;
};

const ONLINE_BOOKING_SOURCES = ["public_link", "public_qr"];

const emptyFacts: ActivationFacts = {
  bookingLinkSharedAt: null,
  hasAvailability: false,
  onlineBookingCount: 0,
  patientCount: 0,
};

/**
 * Datos del checklist de activación. Solo cuenta filas (count / limit 1): no
 * trae listas al cliente. Todas las consultas pasan por RLS y se limitan al
 * espacio activo (o al propio usuario).
 */
export function useActivationChecklist(enabled: boolean) {
  const { accountType, user } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [facts, setFacts] = useState<ActivationFacts>(emptyFacts);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const [hasAttendedAppointment, setHasAttendedAppointment] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Compartió el link en esta visita: si con eso completó el último paso, el
  // Inicio sigue mostrando el checklist al 100% hasta que toque "Ver mi inicio".
  const [sharedThisVisit, setSharedThisVisit] = useState(false);
  const [error, setError] = useState("");

  const workspaceId = activeWorkspace?.id ?? null;
  const workspaceType = activeWorkspace?.type ?? null;
  const sourceClinicId = activeWorkspace?.sourceClinicId ?? null;
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!enabled || !workspaceLoaded || !userId || !workspaceId) {
      setLoaded(workspaceLoaded || !enabled);
      return;
    }

    setError("");

    try {
      const supabase = getSupabaseClient();
      const availabilityQuery =
        workspaceType === "CLINICA"
          ? sourceClinicId
            ? supabase
                .from("clinic_professional_availability")
                .select("id, clinic_professionals!inner(clinic_id)")
                .eq("clinic_professionals.clinic_id", sourceClinicId)
                .eq("active", true)
                .limit(1)
            : null
          : supabase
              .from("independent_availability")
              .select("id")
              .eq("owner_id", userId)
              .eq("active", true)
              .limit(1);
      // El kinesiólogo ve también sus turnos de clínica (owner_id); la clínica,
      // los de su espacio.
      const attendedQuery = supabase
        .from("appointments")
        .select("id")
        .eq("status", "attended")
        .limit(1);

      const [profileResult, patientsResult, availabilityResult, onlineResult, attendedResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("booking_link_shared_at, activation_checklist_dismissed_at")
            .eq("id", userId)
            .maybeSingle<ProfileChecklistRow>(),
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId),
          availabilityQuery,
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .in("booking_source", ONLINE_BOOKING_SOURCES),
          accountType === "KINESIOLOGO"
            ? attendedQuery.eq("owner_id", userId)
            : attendedQuery.eq("workspace_id", workspaceId),
        ]);

      const firstError =
        profileResult.error ??
        patientsResult.error ??
        availabilityResult?.error ??
        onlineResult.error ??
        attendedResult.error;

      if (firstError) {
        throw new Error(mapSupabaseError(firstError));
      }

      setFacts({
        bookingLinkSharedAt: profileResult.data?.booking_link_shared_at ?? null,
        hasAvailability: (availabilityResult?.data?.length ?? 0) > 0,
        onlineBookingCount: onlineResult.count ?? 0,
        patientCount: patientsResult.count ?? 0,
      });
      setDismissedAt(
        profileResult.data?.activation_checklist_dismissed_at ?? null,
      );
      setHasAttendedAppointment((attendedResult.data?.length ?? 0) > 0);
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar los pasos para dejar tu consultorio listo.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [
    accountType,
    enabled,
    sourceClinicId,
    userId,
    workspaceId,
    workspaceLoaded,
    workspaceType,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProfileTimestamp = useCallback(
    async (
      column: "booking_link_shared_at" | "activation_checklist_dismissed_at",
    ) => {
      if (!userId) {
        return null;
      }

      const now = new Date().toISOString();
      const supabase = getSupabaseClient();
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ [column]: now })
        .eq("id", userId);

      if (updateError) {
        throw new Error(mapSupabaseError(updateError));
      }

      return now;
    },
    [userId],
  );

  /** Primer "Copiar link" / "Compartir": completa el paso 4. */
  const markBookingLinkShared = useCallback(async () => {
    if (facts.bookingLinkSharedAt) {
      return;
    }

    setSharedThisVisit(true);

    const sharedAt = await updateProfileTimestamp("booking_link_shared_at");

    if (sharedAt) {
      setFacts((current) => ({ ...current, bookingLinkSharedAt: sharedAt }));
    }
  }, [facts.bookingLinkSharedAt, updateProfileTimestamp]);

  const dismiss = useCallback(async () => {
    const dismissed = await updateProfileTimestamp(
      "activation_checklist_dismissed_at",
    );

    if (dismissed) {
      setDismissedAt(dismissed);
    }
  }, [updateProfileTimestamp]);

  return {
    dismiss,
    dismissedAt,
    error,
    facts,
    hasAttendedAppointment,
    loaded,
    markBookingLinkShared,
    sharedThisVisit,
    finishSharedCelebration: () => setSharedThisVisit(false),
  };
}
