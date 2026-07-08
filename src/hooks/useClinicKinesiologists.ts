"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import {
  CLINIC_PROFESSIONAL_STATUS,
  type ClinicProfessionalStatus,
} from "@/lib/clinic-professionals";
import {
  decideClinicProfessionalMembership,
  getInvitationNotice,
  normalizeProfessionalEmail,
} from "@/lib/clinic-professional-membership";

export type ClinicKinesiologistStatus = ClinicProfessionalStatus;

export type ClinicKinesiologist = {
  email: string;
  firstName: string;
  id: string;
  invitedAt: string;
  lastName: string;
  licenseNumber: string;
  name: string;
  professionalId: string | null;
  role: string;
  status: ClinicKinesiologistStatus;
};

export type KinesiologistLookup = {
  email: string;
  exists: boolean;
  firstName: string;
  id: string | null;
  lastName: string;
  licenseNumber: string;
  name: string;
};

type ProfileValue = {
  email: string | null;
  full_name: string | null;
  license_number: string | null;
};

type ClinicKinesiologistRow = {
  id: string;
  invited_at: string;
  professional_email: string;
  professional_id: string | null;
  role: string | null;
  status: ClinicKinesiologistStatus;
  profiles: ProfileValue | ProfileValue[] | null;
};

type ProfileRow = ProfileValue & {
  id: string;
};

function getProfile(profile: ProfileValue | ProfileValue[] | null) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function mapKinesiologist(row: ClinicKinesiologistRow): ClinicKinesiologist {
  const profile = getProfile(row.profiles);
  const email = profile?.email ?? row.professional_email;
  const name = profile?.full_name?.trim() || "";
  const { firstName, lastName } = splitName(name);

  return {
    email,
    firstName,
    id: row.id,
    invitedAt: formatDate(row.invited_at),
    lastName,
    licenseNumber: profile?.license_number ?? "",
    name,
    professionalId: row.professional_id,
    role: row.role ?? "kinesiologist",
    status: row.status,
  };
}

function mapLookup(email: string, row: ProfileRow | null): KinesiologistLookup {
  const name = row?.full_name?.trim() ?? "";
  const { firstName, lastName } = splitName(name);

  return {
    email: row?.email ?? email,
    exists: Boolean(row),
    firstName,
    id: row?.id ?? null,
    lastName,
    licenseNumber: row?.license_number ?? "",
    name,
  };
}

function getClinicProfessionalSaveError(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (code === "23505") {
    return "Este kinesiologo ya pertenece a la clinica";
  }

  return "No pudimos agregar al kinesiologo. Intenta nuevamente";
}

export function getKinesiologistStatusLabel(status: ClinicKinesiologistStatus) {
  const labels: Record<ClinicKinesiologistStatus, string> = {
    accepted: "Activo",
    inactive: "Desvinculado",
    pending: "Invitación pendiente",
    rejected: "Rechazado",
  };

  return labels[status];
}

export function getKinesiologistRoleLabel(role: string) {
  return role.toUpperCase() === "ADMIN" ? "Admin" : "Kinesiólogo";
}

export function useClinicKinesiologists() {
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [kinesiologists, setKinesiologists] = useState<ClinicKinesiologist[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const clinicId = activeWorkspace?.sourceClinicId ?? "";
  const canManage =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "ADMIN";

  const loadKinesiologists = useCallback(async () => {
    if (!workspaceLoaded) {
      return;
    }

    if (!canManage || !clinicId) {
      setKinesiologists([]);
      setLoaded(true);
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("clinic_professionals")
        .select(
          "id, professional_email, professional_id, role, status, invited_at, profiles(full_name, email, license_number)",
        )
        .eq("clinic_id", clinicId)
        .in("status", [
          CLINIC_PROFESSIONAL_STATUS.pending,
          CLINIC_PROFESSIONAL_STATUS.accepted,
        ])
        .order("invited_at", { ascending: false });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setKinesiologists(
        ((data ?? []) as unknown as ClinicKinesiologistRow[]).map(
          mapKinesiologist,
        ),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar los kinesiólogos.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [canManage, clinicId, workspaceLoaded]);

  useEffect(() => {
    loadKinesiologists();
  }, [loadKinesiologists]);

  async function findByEmail(email: string) {
    const normalizedEmail = normalizeProfessionalEmail(email);

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Ingresá un email válido.");
    }

    const supabase = getSupabaseClient();
    const { data, error: queryError } = await supabase
      .from("profiles")
      .select("id, full_name, email, license_number")
      .eq("account_type", "KINESIOLOGO")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (queryError) {
      throw new Error(mapSupabaseError(queryError));
    }

    return mapLookup(normalizedEmail, data as ProfileRow | null);
  }

  async function createOrReactivateInvitation(lookup: KinesiologistLookup) {
    if (!clinicId) {
      throw new Error("No encontramos la clínica activa.");
    }

    const supabase = getSupabaseClient();
    const { data: activeRows, error: activeError } = await supabase
      .from("clinic_professionals")
      .select("id, status")
      .eq("clinic_id", clinicId)
      .eq("professional_email", lookup.email)
      .in("status", [
        CLINIC_PROFESSIONAL_STATUS.pending,
        CLINIC_PROFESSIONAL_STATUS.accepted,
      ])
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeError) {
      throw new Error(mapSupabaseError(activeError));
    }

    let activeLink = (activeRows?.[0] ?? null) as {
      id: string;
      status: ClinicKinesiologistStatus;
    } | null;

    if (!activeLink && lookup.id) {
      const { data: activeProfessionalRows, error: activeProfessionalError } =
        await supabase
          .from("clinic_professionals")
          .select("id, status")
          .eq("clinic_id", clinicId)
          .eq("professional_id", lookup.id)
          .in("status", [
            CLINIC_PROFESSIONAL_STATUS.pending,
            CLINIC_PROFESSIONAL_STATUS.accepted,
          ])
          .order("created_at", { ascending: false })
          .limit(1);

      if (activeProfessionalError) {
        throw new Error(mapSupabaseError(activeProfessionalError));
      }

      activeLink = (activeProfessionalRows?.[0] ?? null) as {
        id: string;
        status: ClinicKinesiologistStatus;
      } | null;
    }

    const { data: inactiveRows, error: inactiveError } = await supabase
      .from("clinic_professionals")
      .select("id, status")
      .eq("clinic_id", clinicId)
      .eq("professional_email", lookup.email)
      .eq("status", CLINIC_PROFESSIONAL_STATUS.inactive)
      .order("created_at", { ascending: false })
      .limit(1);

    if (inactiveError) {
      throw new Error(mapSupabaseError(inactiveError));
    }

    let inactiveLink = (inactiveRows?.[0] ?? null) as {
      id: string;
      status: ClinicKinesiologistStatus;
    } | null;

    if (!inactiveLink && lookup.id) {
      const { data: inactiveProfessionalRows, error: inactiveProfessionalError } =
        await supabase
          .from("clinic_professionals")
          .select("id, status")
          .eq("clinic_id", clinicId)
          .eq("professional_id", lookup.id)
          .eq("status", CLINIC_PROFESSIONAL_STATUS.inactive)
          .order("created_at", { ascending: false })
          .limit(1);

      if (inactiveProfessionalError) {
        throw new Error(mapSupabaseError(inactiveProfessionalError));
      }

      inactiveLink = (inactiveProfessionalRows?.[0] ?? null) as {
        id: string;
        status: ClinicKinesiologistStatus;
      } | null;
    }

    const decision = decideClinicProfessionalMembership({
      activeLink,
      clinicId,
      inactiveLink,
      lookup,
    });

    if (decision.type === "duplicate") {
      throw new Error(decision.message);
    }

    if (decision.type === "reactivate") {
      console.info("[clinic_professionals:update]", {
        id: decision.id,
        payload: decision.payload,
      });

      const { data, error: updateError } = await supabase
        .from("clinic_professionals")
        .update(decision.payload)
        .eq("id", decision.id)
        .select("id")
        .single();

      if (updateError) {
        console.error("[clinic_professionals:update:error]", updateError);
        throw new Error(getClinicProfessionalSaveError(updateError));
      }

      await loadKinesiologists();
      return (data as { id: string }).id;
    }

    console.info("[clinic_professionals:insert]", {
      invitationNotice: getInvitationNotice(lookup),
      payload: decision.payload,
    });

    const { data, error: insertError } = await supabase
      .from("clinic_professionals")
      .insert(decision.payload)
      .select("id")
      .single();

    if (insertError) {
      console.error("[clinic_professionals:insert:error]", insertError);
      throw new Error(getClinicProfessionalSaveError(insertError));
    }

    await loadKinesiologists();
    return (data as { id: string }).id;
  }

  async function unlinkKinesiologist(id: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("clinic_professionals")
      .update({
        status: CLINIC_PROFESSIONAL_STATUS.inactive,
      })
      .eq("clinic_id", clinicId)
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadKinesiologists();
  }

  return {
    canManage,
    clinicId,
    createOrReactivateInvitation,
    error,
    findByEmail,
    kinesiologists,
    loaded,
    refreshKinesiologists: loadKinesiologists,
    unlinkKinesiologist,
  };
}

