"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

export type ClinicKinesiologistStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "inactive";

export type ClinicKinesiologist = {
  email: string;
  firstName: string;
  id: string;
  invitedAt: string;
  lastName: string;
  licenseNumber: string;
  name: string;
  professionalId: string | null;
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

export function getKinesiologistStatusLabel(status: ClinicKinesiologistStatus) {
  const labels: Record<ClinicKinesiologistStatus, string> = {
    accepted: "Vinculado",
    inactive: "Desvinculado",
    pending: "Invitación pendiente",
    rejected: "Invitación rechazada",
  };

  return labels[status];
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
          "id, professional_email, professional_id, status, invited_at, profiles(full_name, email, license_number)",
        )
        .eq("clinic_id", clinicId)
        .in("status", ["pending", "accepted"])
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
    const normalizedEmail = email.trim().toLowerCase();

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
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (activeError) {
      throw new Error(mapSupabaseError(activeError));
    }

    const activeLink = (activeRows?.[0] ?? null) as {
      id: string;
      status: ClinicKinesiologistStatus;
    } | null;

    if (activeLink?.status === "accepted") {
      throw new Error("Este kinesiólogo ya está vinculado a la clínica.");
    }

    if (activeLink?.status === "pending") {
      return activeLink.id;
    }

    const { data: inactiveRows, error: inactiveError } = await supabase
      .from("clinic_professionals")
      .select("id, status")
      .eq("clinic_id", clinicId)
      .eq("professional_email", lookup.email)
      .in("status", ["inactive", "rejected"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (inactiveError) {
      throw new Error(mapSupabaseError(inactiveError));
    }

    const inactiveLink = (inactiveRows?.[0] ?? null) as {
      id: string;
      status: ClinicKinesiologistStatus;
    } | null;

    if (inactiveLink) {
      const { data, error: updateError } = await supabase
        .from("clinic_professionals")
        .update({
          invited_at: new Date().toISOString(),
          professional_id: lookup.id,
          responded_at: null,
          status: "pending",
        })
        .eq("id", inactiveLink.id)
        .select("id")
        .single();

      if (updateError) {
        throw new Error(mapSupabaseError(updateError));
      }

      await loadKinesiologists();
      return (data as { id: string }).id;
    }

    const { data, error: insertError } = await supabase
      .from("clinic_professionals")
      .insert({
        clinic_id: clinicId,
        professional_email: lookup.email,
        professional_id: lookup.id,
        role: "kinesiologist",
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadKinesiologists();
    return (data as { id: string }).id;
  }

  async function unlinkKinesiologist(id: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("clinic_professionals")
      .update({
        status: "inactive",
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
