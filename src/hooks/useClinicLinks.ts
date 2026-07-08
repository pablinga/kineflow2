"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import {
  CLINIC_PROFESSIONAL_STATUS,
  type ClinicProfessionalStatus,
} from "@/lib/clinic-professionals";

export type ClinicLinkStatus = ClinicProfessionalStatus;

export type ClinicAvailability = {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  validFrom: string | null;
  validTo: string | null;
};

export type ClinicLink = {
  id: string;
  clinicId: string;
  clinicName: string;
  clinicEmail: string;
  clinicPhone: string;
  clinicAddress: string;
  status: ClinicLinkStatus;
  statusLabel: string;
  invitedAt: string;
  respondedAt: string | null;
  color: string;
  role: string;
  availability: ClinicAvailability[];
};

type ClinicLinkRow = {
  id: string;
  clinic_id: string;
  status: ClinicLinkStatus;
  invited_at: string;
  responded_at: string | null;
  color: string;
  role: string;
  clinics:
    | {
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
      }
    | Array<{
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
      }>
    | null;
  clinic_professional_availability:
    | Array<{
        id: string;
        weekday: number;
        starts_at: string;
        ends_at: string;
        active: boolean;
        valid_from: string | null;
        valid_to: string | null;
      }>
    | null;
};

const statusLabels: Record<ClinicLinkStatus, string> = {
  pending: "Pendiente",
  accepted: "Activo",
  inactive: "Inactivo",
  rejected: "Rechazado",
};

export const weekdayLabels = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miercoles",
  "Jueves",
  "Viernes",
  "Sabado",
];

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function mapClinicLink(row: ClinicLinkRow): ClinicLink {
  const clinic = Array.isArray(row.clinics) ? row.clinics[0] : row.clinics;

  return {
    id: row.id,
    clinicId: row.clinic_id,
    clinicName: clinic?.name ?? "Consultorio",
    clinicEmail: clinic?.email ?? "Sin email",
    clinicPhone: clinic?.phone ?? "Sin telefono",
    clinicAddress: clinic?.address ?? "Sin direccion",
    status: row.status,
    statusLabel: statusLabels[row.status],
    invitedAt: row.invited_at,
    respondedAt: row.responded_at,
    color: row.color,
    role: row.role,
    availability: (row.clinic_professional_availability ?? [])
      .filter((availability) => availability.active)
      .map((availability) => ({
        id: availability.id,
        weekday: availability.weekday,
        startsAt: normalizeTime(availability.starts_at),
        endsAt: normalizeTime(availability.ends_at),
        active: availability.active,
        validFrom: availability.valid_from,
        validTo: availability.valid_to,
      }))
      .sort(
        (left, right) =>
          left.weekday - right.weekday ||
          left.startsAt.localeCompare(right.startsAt),
      ),
  };
}

export function formatAvailability(availability: ClinicAvailability[]) {
  if (availability.length === 0) {
    return "Sin horarios asignados";
  }

  return availability
    .map(
      (item) =>
        `${weekdayLabels[item.weekday]} ${item.startsAt} a ${item.endsAt}`,
    )
    .join(", ");
}

export function useClinicLinks() {
  const [links, setLinks] = useState<ClinicLink[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadLinks = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      const userEmail = sessionData.user.email?.trim().toLowerCase() ?? "";
      const { data, error: queryError } = await supabase
        .from("clinic_professionals")
        .select(
          "id, clinic_id, status, invited_at, responded_at, color, role, clinics(name, email, phone, address), clinic_professional_availability(id, weekday, starts_at, ends_at, active, valid_from, valid_to)",
        )
        .or(
          `professional_id.eq.${sessionData.user.id},and(professional_id.is.null,professional_email.eq.${userEmail})`,
        )
        .order("invited_at", { ascending: false });

      if (queryError) {
        setError(mapSupabaseError(queryError));
        return;
      }

      setLinks(((data ?? []) as unknown as ClinicLinkRow[]).map(mapClinicLink));
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar tus consultorios."),
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const pendingLinks = useMemo(
    () =>
      links.filter(
        (link) => link.status === CLINIC_PROFESSIONAL_STATUS.pending,
      ),
    [links],
  );

  async function answerInvitation(
    id: string,
    status:
      | typeof CLINIC_PROFESSIONAL_STATUS.accepted
      | typeof CLINIC_PROFESSIONAL_STATUS.inactive,
  ) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const { error: updateError } = await supabase
      .from("clinic_professionals")
      .update({
        professional_id: sessionData.user.id,
        responded_at: new Date().toISOString(),
        status,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadLinks();
  }

  return {
    acceptInvitation: (id: string) =>
      answerInvitation(id, CLINIC_PROFESSIONAL_STATUS.accepted),
    error,
    links,
    loaded,
    pendingLinks,
    refreshLinks: loadLinks,
    rejectInvitation: (id: string) =>
      answerInvitation(id, CLINIC_PROFESSIONAL_STATUS.inactive),
  };
}
