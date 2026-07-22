"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

export type PendingClinicInvitation = {
  clinicName: string;
  id: string;
  invitedAt: string;
};

type ClinicInvitationRow = {
  clinics: { name: string } | Array<{ name: string }> | null;
  id: string;
  invited_at: string;
};

function getClinicName(
  clinic: { name: string } | Array<{ name: string }> | null,
) {
  const clinicRow = Array.isArray(clinic) ? clinic[0] : clinic;

  return clinicRow?.name ?? "la clínica";
}

export function usePendingClinicInvitations(user: User | null) {
  const [actionError, setActionError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [pendingInvitations, setPendingInvitations] = useState<
    PendingClinicInvitation[]
  >([]);

  const loadInvitations = useCallback(async () => {
    setActionError("");
    setNotice("");

    if (!user) {
      setPendingInvitations([]);
      setLoaded(true);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const userEmail = user.email?.trim().toLowerCase();
      const ownerFilter = userEmail
        ? `professional_id.eq.${user.id},professional_email.eq.${userEmail}`
        : `professional_id.eq.${user.id}`;
      const { data, error } = await supabase
        .from("clinic_professionals")
        .select("id, invited_at, clinics(name)")
        .eq("status", "pending")
        .or(ownerFilter)
        .order("invited_at", { ascending: false });

      if (error) {
        throw new Error(mapSupabaseError(error));
      }

      setPendingInvitations(
        ((data ?? []) as unknown as ClinicInvitationRow[]).map((row) => ({
          clinicName: getClinicName(row.clinics),
          id: row.id,
          invitedAt: row.invited_at,
        })),
      );
    } catch (loadError) {
      setActionError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar tus invitaciones pendientes.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  async function answerInvitation(id: string, targetStatus: "active" | "inactive") {
    if (!user?.email) {
      throw new Error("No pudimos identificar tu email.");
    }

    setActionError("");
    setNotice("");

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.rpc(
        "answer_clinic_professional_invitation",
        {
          invitation_id: id,
          target_email: user.email.trim().toLowerCase(),
          target_professional_id: user.id,
          target_status: targetStatus,
        },
      );

      if (error) {
        throw new Error(mapSupabaseError(error));
      }

      setPendingInvitations((current) =>
        current.filter((invitation) => invitation.id !== id),
      );
      setNotice(
        targetStatus === "active"
          ? "Invitación aceptada correctamente."
          : "Invitación rechazada.",
      );
    } catch (answerError) {
      setActionError(
        getFriendlyErrorMessage(
          answerError,
          "No pudimos responder la invitación.",
        ),
      );
      throw answerError;
    }
  }

  return {
    acceptInvitation: (id: string) => answerInvitation(id, "active"),
    actionError,
    loaded,
    notice,
    pendingInvitations,
    refreshInvitations: loadInvitations,
    rejectInvitation: (id: string) => answerInvitation(id, "inactive"),
  };
}
