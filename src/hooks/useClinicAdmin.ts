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
  color: string;
  professional: ProfessionalSearchResult;
  availability: Array<{
    weekday: number;
    startsAt: string;
    endsAt: string;
  }>;
};

export type ProfessionalSearchResult = {
  id: string;
  fullName: string;
  email: string;
  maskedEmail: string;
  licenseNumber: string;
  specialty: string;
};

type ClinicRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  color: string;
};

type ProfessionalRow = {
  id: string;
  full_name: string;
  email: string | null;
  license_number: string | null;
  specialty: string | null;
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

function maskEmail(email: string) {
  const [name, domain] = email.split("@");

  if (!name || !domain) {
    return email;
  }

  return `${name.slice(0, 2)}***@${domain}`;
}

function mapProfessional(row: ProfessionalRow): ProfessionalSearchResult {
  const email = row.email ?? "";

  return {
    id: row.id,
    email,
    fullName: row.full_name,
    licenseNumber: row.license_number ?? "",
    maskedEmail: email ? maskEmail(email) : "Email no disponible",
    specialty: row.specialty ?? "Sin especialidad cargada",
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

  async function searchProfessionalByLicense(licenseNumber: string) {
    const normalizedLicense = licenseNumber.trim();

    if (!normalizedLicense) {
      throw new Error("Ingresa una matricula para buscar.");
    }

    const supabase = getSupabaseClient();
    const { data, error: queryError } = await supabase
      .from("profiles")
      .select("id, full_name, email, license_number, specialty")
      .eq("account_type", "KINESIOLOGO")
      .eq("license_number", normalizedLicense)
      .maybeSingle();

    if (queryError) {
      throw new Error(queryError.message);
    }

    return data ? mapProfessional(data as ProfessionalRow) : null;
  }

  async function inviteProfessional(input: ClinicInvitationInput) {
    const supabase = getSupabaseClient();
    const { data: link, error: linkError } = await supabase
      .from("clinic_professionals")
      .insert({
        clinic_id: input.clinicId,
        professional_email: input.professional.email.trim().toLowerCase(),
        professional_id: input.professional.id,
        color: input.color,
        role: "kinesiologist",
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
    error,
    inviteProfessional,
    loaded,
    refreshClinics: loadClinics,
    searchProfessionalByLicense,
  };
}
