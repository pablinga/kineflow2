"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export type Clinic = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  color: string;
};

export type ClinicInvitationInput = {
  clinicId: string;
  email: string;
  color: string;
  role: string;
  availability: Array<{
    weekday: number;
    startsAt: string;
    endsAt: string;
  }>;
};

type ClinicRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  color: string;
};

function mapClinic(row: ClinicRow): Clinic {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    address: row.address ?? "",
    color: row.color,
  };
}

export function useClinicAdmin() {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadClinics = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("clinics")
        .select("id, name, email, phone, address, color")
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setClinics(((data ?? []) as ClinicRow[]).map(mapClinic));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No pudimos cargar consultorios.",
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadClinics();
  }, [loadClinics]);

  async function createClinic(input: Omit<Clinic, "id">) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const { error: insertError } = await supabase.from("clinics").insert({
      owner_id: sessionData.user.id,
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      address: input.address || null,
      color: input.color,
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await loadClinics();
  }

  async function inviteProfessional(input: ClinicInvitationInput) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const supabase = getSupabaseClient();
    const { data: link, error: linkError } = await supabase
      .from("clinic_professionals")
      .insert({
        clinic_id: input.clinicId,
        professional_email: normalizedEmail,
        color: input.color,
        role: input.role || "kinesiologist",
        status: "pending",
      })
      .select("id")
      .single();

    if (linkError) {
      throw new Error(linkError.message);
    }

    const availabilityRows = input.availability.map((availability) => ({
      clinic_professional_id: link.id,
      weekday: availability.weekday,
      starts_at: availability.startsAt,
      ends_at: availability.endsAt,
      active: true,
    }));

    if (availabilityRows.length > 0) {
      const { error: availabilityError } = await supabase
        .from("clinic_professional_availability")
        .insert(availabilityRows);

      if (availabilityError) {
        throw new Error(availabilityError.message);
      }
    }
  }

  return {
    clinics,
    createClinic,
    error,
    inviteProfessional,
    loaded,
    refreshClinics: loadClinics,
  };
}
