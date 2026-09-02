"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { weekdayLabels } from "@/hooks/useClinicLinks";
import { hasOverlappingAvailability } from "@/lib/availability-utils";
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
  canRegisterEvolutions: boolean;
  canViewAssignedPatients: boolean;
  color: string;
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

export type KinesiologistAvailabilityInput = {
  weekday: number;
  startsAt: string;
  endsAt: string;
};

type ProfileValue = {
  email: string | null;
  full_name: string | null;
  license_number: string | null;
};

type ClinicKinesiologistRow = {
  can_register_evolutions: boolean | null;
  can_view_assigned_patients: boolean | null;
  color: string | null;
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

type AvailabilityRow = {
  weekday: number;
  starts_at: string;
  ends_at: string;
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
    canRegisterEvolutions: row.can_register_evolutions ?? true,
    canViewAssignedPatients: row.can_view_assigned_patients ?? true,
    color: row.color ?? "#14b8a6",
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

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function validateAvailability(availability: KinesiologistAvailabilityInput[]) {
  const invalidAvailability = availability.some(
    (item) => !item.startsAt || !item.endsAt || item.startsAt >= item.endsAt,
  );

  if (invalidAvailability) {
    throw new Error("Revisá que cada franja tenga un horario válido.");
  }

  const conflictingWeekday = hasOverlappingAvailability(availability);

  if (conflictingWeekday !== null) {
    throw new Error(
      `Hay franjas superpuestas en ${weekdayLabels[conflictingWeekday]}. Ajustá los horarios para que no se crucen.`,
    );
  }
}

function mapAvailabilityRows(
  clinicProfessionalId: string,
  availability: KinesiologistAvailabilityInput[],
) {
  return availability.map((item) => ({
    clinic_professional_id: clinicProfessionalId,
    weekday: item.weekday,
    starts_at: item.startsAt,
    ends_at: item.endsAt,
    active: true,
  }));
}

export function getKinesiologistStatusLabel(status: ClinicKinesiologistStatus) {
  const labels: Record<ClinicKinesiologistStatus, string> = {
    active: "Activo",
    inactive: "Desvinculado",
    pending: "Invitación pendiente",
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
          "id, professional_email, professional_id, role, status, invited_at, color, can_register_evolutions, can_view_assigned_patients, profiles(full_name, email, license_number)",
        )
        .eq("clinic_id", clinicId)
        .in("status", [
          CLINIC_PROFESSIONAL_STATUS.pending,
          CLINIC_PROFESSIONAL_STATUS.active,
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
        CLINIC_PROFESSIONAL_STATUS.active,
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
            CLINIC_PROFESSIONAL_STATUS.active,
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

  async function saveAvailability(
    clinicProfessionalId: string,
    availability: KinesiologistAvailabilityInput[],
  ) {
    if (availability.length === 0) {
      return;
    }

    validateAvailability(availability);

    const supabase = getSupabaseClient();
    const { error: availabilityError } = await supabase
      .from("clinic_professional_availability")
      .insert(mapAvailabilityRows(clinicProfessionalId, availability));

    if (availabilityError) {
      throw new Error(mapSupabaseError(availabilityError));
    }
  }

  async function loadAvailability(clinicProfessionalId: string) {
    const supabase = getSupabaseClient();
    const { data, error: availabilityError } = await supabase
      .from("clinic_professional_availability")
      .select("weekday, starts_at, ends_at")
      .eq("clinic_professional_id", clinicProfessionalId)
      .eq("active", true)
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true });

    if (availabilityError) {
      throw new Error(mapSupabaseError(availabilityError));
    }

    return ((data ?? []) as AvailabilityRow[]).map((item) => ({
      weekday: item.weekday,
      startsAt: normalizeTime(item.starts_at),
      endsAt: normalizeTime(item.ends_at),
    }));
  }

  async function updateAvailability(
    clinicProfessionalId: string,
    availability: KinesiologistAvailabilityInput[],
  ) {
    validateAvailability(availability);

    const supabase = getSupabaseClient();
    const { error: deleteError } = await supabase
      .from("clinic_professional_availability")
      .delete()
      .eq("clinic_professional_id", clinicProfessionalId);

    if (deleteError) {
      throw new Error(mapSupabaseError(deleteError));
    }

    if (availability.length === 0) {
      return;
    }

    const { error: insertError } = await supabase
      .from("clinic_professional_availability")
      .insert(mapAvailabilityRows(clinicProfessionalId, availability));

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }
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

  async function updateKinesiologist(
    id: string,
    changes: {
      color?: string;
      canRegisterEvolutions?: boolean;
      canViewAssignedPatients?: boolean;
    },
  ) {
    const payload: {
      color?: string;
      can_register_evolutions?: boolean;
      can_view_assigned_patients?: boolean;
    } = {};

    if (changes.color !== undefined) {
      payload.color = changes.color;
    }

    if (changes.canRegisterEvolutions !== undefined) {
      payload.can_register_evolutions = changes.canRegisterEvolutions;
    }

    if (changes.canViewAssignedPatients !== undefined) {
      payload.can_view_assigned_patients = changes.canViewAssignedPatients;
    }

    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("clinic_professionals")
      .update(payload)
      .eq("clinic_id", clinicId)
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadKinesiologists();
  }

  async function removeKinesiologist(id: string) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("clinic_professionals")
      .update({
        responded_at: new Date().toISOString(),
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
    loadAvailability,
    loaded,
    refreshKinesiologists: loadKinesiologists,
    removeKinesiologist,
    saveAvailability,
    unlinkKinesiologist,
    updateAvailability,
    updateKinesiologist,
  };
}

