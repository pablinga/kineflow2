"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate, formatDateTime } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { useActiveClinic } from "@/hooks/useActiveClinic";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export type PatientStatus = "Activo" | "Inactivo";

export type Patient = {
  id: string;
  clinicId: string | null;
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
  status?: PatientStatus;
};

type PatientRow = {
  id: string;
  full_name: string;
  document_number: string;
  phone: string | null;
  email: string | null;
  initial_condition: string;
  status: "active" | "inactive";
  clinic_id: string | null;
};

type ClinicIdRow = {
  id: string;
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
  const lastSession = lastAttendedAppointment
    ? formatDateTime(lastAttendedAppointment.scheduled_at)
    : lastEvolution
      ? formatDate(lastEvolution.session_date)
      : "Sin sesiónes";

  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.full_name,
    document: row.document_number,
    phone: row.phone ?? "",
    email: row.email ?? "",
    condition: row.initial_condition,
    status: row.status === "active" ? "Activo" : "Inactivo",
    progress: lastEvolution
      ? formatDate(lastEvolution.session_date)
      : "Sin evolución registrada",
    lastSession,
    nextAppointment: nextAppointment
      ? formatDateTime(nextAppointment.scheduled_at)
      : "Sin turno",
  };
}

function normalizePatientInput(input: NewPatientInput) {
  return {
    condition: input.condition.trim(),
    document: input.document.trim(),
    email: input.email.trim(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    status: input.status ?? "Activo",
  };
}

function assertPatientContact(input: ReturnType<typeof normalizePatientInput>) {
  if (!input.phone && !input.email) {
    throw new Error("Ingresá al menos un medio de contacto (teléfono o email)");
  }
}

function mapPatientStatusToDb(status: PatientStatus) {
  return status === "Inactivo" ? "inactive" : "active";
}

export function usePatients() {
  const { accountType } = useRequireAuth();
  const {
    clinic: activeClinic,
    error: activeClinicError,
    loaded: activeClinicLoaded,
  } = useActiveClinic(accountType === "CONSULTORIO");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadPatients = useCallback(async () => {
    if (accountType === "CONSULTORIO" && !activeClinicLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      if (accountType === "CONSULTORIO" && activeClinicError) {
        setError(activeClinicError);
        setPatients([]);
        return;
      }

      let patientQuery = supabase
        .from("patients")
        .select(
          "id, clinic_id, full_name, document_number, phone, email, initial_condition, status",
        )
        .order("created_at", { ascending: false });

      if (accountType === "CONSULTORIO") {
        if (!activeClinic?.id) {
          setError("No encontramos un consultorio asociado a tu usuario.");
          setPatients([]);
          return;
        }

        patientQuery = patientQuery
          .eq("owner_id", sessionData.user.id)
          .eq("clinic_id", activeClinic.id);
      } else {
        patientQuery = patientQuery
          .eq("owner_id", sessionData.user.id)
          .is("clinic_id", null);
      }

      const { data, error: queryError } = await patientQuery;

      if (queryError) {
        setError(mapSupabaseError(queryError));
        return;
      }

      const patientRows = (data ?? []) as PatientRow[];
      const patientIds = patientRows.map((patient) => patient.id);

      if (patientIds.length === 0) {
        setPatients([]);
        return;
      }

      let appointmentsQuery = supabase
        .from("appointments")
        .select("patient_id, scheduled_at, status")
        .in("patient_id", patientIds);
      let evolutionsQuery = supabase
        .from("evolutions")
        .select("patient_id, session_date, clinical_notes")
        .in("patient_id", patientIds);

      if (accountType === "CONSULTORIO") {
        appointmentsQuery = appointmentsQuery.eq("clinic_id", activeClinic?.id ?? "");
      } else {
        appointmentsQuery = appointmentsQuery.eq("owner_id", sessionData.user.id);
        evolutionsQuery = evolutionsQuery.eq("owner_id", sessionData.user.id);
      }

      const [
        { data: appointmentsData, error: appointmentsError },
        { data: evolutionsData, error: evolutionsError },
      ] = await Promise.all([appointmentsQuery, evolutionsQuery]);

      if (appointmentsError || evolutionsError) {
        setError(
          (appointmentsError
            ? mapSupabaseError(appointmentsError)
            : evolutionsError
              ? mapSupabaseError(evolutionsError)
              : null) ??
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
        getFriendlyErrorMessage(loadError, "No pudimos cargar pacientes."),
      );
    } finally {
      setLoaded(true);
    }
  }, [accountType, activeClinic?.id, activeClinicError, activeClinicLoaded]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const activePatients = useMemo(
    () =>
      patients.filter(
        (patient) =>
          patient.status === "Activo" &&
          (accountType === "CONSULTORIO"
            ? Boolean(patient.clinicId)
            : !patient.clinicId),
      ),
    [accountType, patients],
  );

  async function findDuplicatePatient(params: {
    document: string;
    excludePatientId?: string;
    ownerId: string;
  }) {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("patients")
      .select("id, full_name")
      .eq("owner_id", params.ownerId)
      .eq("document_number", params.document)
      .limit(1);

    if (params.excludePatientId) {
      query = query.neq("id", params.excludePatientId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new Error(mapSupabaseError(error));
    }

    return data as { full_name: string; id: string } | null;
  }

  async function addPatient(input: NewPatientInput) {
    setError("");
    const normalizedInput = normalizePatientInput(input);
    assertPatientContact(normalizedInput);

    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    let clinicId: string | null = null;

    if (accountType === "CONSULTORIO") {
      const { data: clinicData, error: clinicError } = await supabase
        .from("clinics")
        .select("id")
        .eq("owner_id", sessionData.user.id)
        .limit(1)
        .maybeSingle();

      if (clinicError) {
        throw new Error(mapSupabaseError(clinicError));
      }

      clinicId = ((clinicData as ClinicIdRow | null)?.id ?? null);

      if (!clinicId) {
        throw new Error("La cuenta consultorio no tiene un consultorio asociado.");
      }
    }

    const duplicatePatient = await findDuplicatePatient({
      document: normalizedInput.document,
      ownerId: sessionData.user.id,
    });

    if (duplicatePatient) {
      throw new Error(
        `Ya tenés un paciente registrado con ese DNI: ${duplicatePatient.full_name}`,
      );
    }

    const { error: insertError } = await supabase.from("patients").insert({
      owner_id: sessionData.user.id,
      clinic_id: clinicId,
      full_name: normalizedInput.name,
      document_number: normalizedInput.document,
      phone: normalizedInput.phone || null,
      email: normalizedInput.email || null,
      initial_condition: normalizedInput.condition,
      status: mapPatientStatusToDb(normalizedInput.status),
    });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadPatients();
  }

  async function updatePatient(id: string, input: NewPatientInput) {
    setError("");
    const normalizedInput = normalizePatientInput(input);
    assertPatientContact(normalizedInput);

    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const duplicatePatient = await findDuplicatePatient({
      document: normalizedInput.document,
      excludePatientId: id,
      ownerId: sessionData.user.id,
    });

    if (duplicatePatient) {
      throw new Error(
        `Ya tenés un paciente registrado con ese DNI: ${duplicatePatient.full_name}`,
      );
    }

    const { error: updateError } = await supabase
      .from("patients")
      .update({
        document_number: normalizedInput.document,
        email: normalizedInput.email || null,
        full_name: normalizedInput.name,
        initial_condition: normalizedInput.condition,
        phone: normalizedInput.phone || null,
        status: mapPatientStatusToDb(normalizedInput.status),
      })
      .eq("owner_id", sessionData.user.id)
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadPatients();
  }

  async function disablePatient(id: string) {
    setError("");

    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const { error: updateError } = await supabase
      .from("patients")
      .update({
        status: "inactive",
        disabled_at: new Date().toISOString(),
      })
      .eq("owner_id", sessionData.user.id)
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
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
    updatePatient,
  };
}
