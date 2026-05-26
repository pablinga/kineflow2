"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export type PatientStatus = "Activo" | "Inactivo";

export type Patient = {
  id: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  condition: string;
  status: PatientStatus;
  progress: string;
  lastSession: string;
  nextAppointment: string;
};

export type NewPatientInput = {
  name: string;
  document: string;
  phone: string;
  email: string;
  condition: string;
};

type PatientRow = {
  id: string;
  full_name: string;
  document_number: string;
  phone: string | null;
  email: string | null;
  initial_condition: string;
  status: "active" | "inactive";
};

function mapPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    name: row.full_name,
    document: row.document_number,
    phone: row.phone ?? "Sin teléfono",
    email: row.email ?? "Sin email",
    condition: row.initial_condition,
    status: row.status === "active" ? "Activo" : "Inactivo",
    progress: "Sin evolución registrada",
    lastSession: "Sin sesiones",
    nextAppointment: "Sin turno",
  };
}

export function usePatients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadPatients = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("patients")
        .select(
          "id, full_name, document_number, phone, email, initial_condition, status",
        )
        .order("created_at", { ascending: false });

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setPatients(((data ?? []) as PatientRow[]).map(mapPatient));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No pudimos cargar pacientes.",
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const activePatients = useMemo(
    () => patients.filter((patient) => patient.status === "Activo"),
    [patients],
  );

  async function addPatient(input: NewPatientInput) {
    setError("");

    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const { error: insertError } = await supabase.from("patients").insert({
      owner_id: sessionData.user.id,
      full_name: input.name,
      document_number: input.document,
      phone: input.phone,
      email: input.email,
      initial_condition: input.condition,
      status: "active",
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await loadPatients();
  }

  async function disablePatient(id: string) {
    setError("");

    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("patients")
      .update({
        status: "inactive",
        disabled_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await loadPatients();
  }

  return {
    activePatients,
    addPatient,
    disablePatient,
    error,
    loaded,
    patients,
    refreshPatients: loadPatients,
  };
}
