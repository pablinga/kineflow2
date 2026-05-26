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

type PatientAppointmentRow = {
  patient_id: string;
  scheduled_at: string;
  status:
    | "pending"
    | "attended"
    | "cancelled"
    | "no_show"
    | "rescheduled"
    | "confirmed"
    | "completed";
};

type PatientEvolutionRow = {
  patient_id: string;
  session_date: string;
  clinical_notes: string | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  return `${date.toLocaleDateString("es-AR")} ${date.toLocaleTimeString(
    "es-AR",
    {
      hour: "2-digit",
      minute: "2-digit",
    },
  )}`;
}

function mapPatient(
  row: PatientRow,
  appointments: PatientAppointmentRow[],
  evolutions: PatientEvolutionRow[],
): Patient {
  const now = Date.now();
  const patientAppointments = appointments
    .filter((appointment) => appointment.patient_id === row.id)
    .sort(
      (left, right) =>
        new Date(left.scheduled_at).getTime() -
        new Date(right.scheduled_at).getTime(),
    );
  const lastAttendedAppointment = [...patientAppointments]
    .reverse()
    .find(
      (appointment) =>
        ["attended", "completed"].includes(appointment.status) &&
        new Date(appointment.scheduled_at).getTime() <= now,
    );
  const nextAppointment = patientAppointments.find(
    (appointment) =>
      ["pending", "confirmed", "rescheduled"].includes(appointment.status) &&
      new Date(appointment.scheduled_at).getTime() >= now,
  );
  const lastEvolution = evolutions
    .filter((evolution) => evolution.patient_id === row.id)
    .sort(
      (left, right) =>
        new Date(right.session_date).getTime() -
        new Date(left.session_date).getTime(),
    )[0];

  return {
    id: row.id,
    name: row.full_name,
    document: row.document_number,
    phone: row.phone ?? "Sin teléfono",
    email: row.email ?? "Sin email",
    condition: row.initial_condition,
    status: row.status === "active" ? "Activo" : "Inactivo",
    progress: lastEvolution
      ? new Date(`${lastEvolution.session_date}T00:00:00`).toLocaleDateString(
          "es-AR",
        )
      : "Sin evolución registrada",
    lastSession: lastAttendedAppointment
      ? formatDateTime(lastAttendedAppointment.scheduled_at)
      : "Sin sesiones",
    nextAppointment: nextAppointment
      ? formatDateTime(nextAppointment.scheduled_at)
      : "Sin turno",
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

      const patientRows = (data ?? []) as PatientRow[];
      const patientIds = patientRows.map((patient) => patient.id);

      if (patientIds.length === 0) {
        setPatients([]);
        return;
      }

      const [
        { data: appointmentsData, error: appointmentsError },
        { data: evolutionsData, error: evolutionsError },
      ] = await Promise.all([
        supabase
          .from("appointments")
          .select("patient_id, scheduled_at, status")
          .in("patient_id", patientIds),
        supabase
          .from("evolutions")
          .select("patient_id, session_date, clinical_notes")
          .in("patient_id", patientIds),
      ]);

      if (appointmentsError || evolutionsError) {
        setError(
          appointmentsError?.message ??
            evolutionsError?.message ??
            "No pudimos cargar el resumen de pacientes.",
        );
        return;
      }

      setPatients(
        patientRows.map((patient) =>
          mapPatient(
            patient,
            (appointmentsData ?? []) as PatientAppointmentRow[],
            (evolutionsData ?? []) as PatientEvolutionRow[],
          ),
        ),
      );
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
