"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate, formatDateTime } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export type PatientStatus = "Activo" | "Inactivo";

export type Patient = {
  id: string;
  assignedProfessionalId: string | null;
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
  lastPaymentStatus: string;
};

export type NewPatientInput = {
  assignedProfessionalId?: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  condition: string;
  status?: PatientStatus;
};

type PatientRow = {
  id: string;
  assigned_professional_id: string | null;
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

export type UsePatientsOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
};

type ClinicProfessionalAccessRow = {
  can_view_assigned_patients: boolean;
};

type PatientAppointmentRow = {
  patient_id: string;
  scheduled_at: string;
  payment_status: "pending" | "paid" | "waived" | "not_applicable" | null;
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
  const lastAppointment = [...patientAppointments]
    .reverse()
    .find((appointment) => new Date(appointment.scheduled_at).getTime() <= now);
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
    assignedProfessionalId: row.assigned_professional_id,
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
    lastPaymentStatus: lastAppointment?.payment_status
      ? patientPaymentStatusLabels[lastAppointment.payment_status]
      : "Sin turno",
  };
}

function normalizePatientInput(input: NewPatientInput) {
  return {
    assignedProfessionalId: input.assignedProfessionalId?.trim() ?? "",
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

const patientPaymentStatusLabels: Record<
  NonNullable<PatientAppointmentRow["payment_status"]>,
  string
> = {
  not_applicable: "No corresponde",
  paid: "Cobrado",
  pending: "Pendiente",
  waived: "Bonificado",
};

export function usePatients(options: UsePatientsOptions = {}) {
  const { accountType, user } = useRequireAuth();
  const {
    activeWorkspace,
    error: activeWorkspaceError,
    loaded: activeWorkspaceLoaded,
  } = useActiveWorkspace();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [activePatientCount, setActivePatientCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const page = Math.max(options.page ?? 1, 1);
  const pageSize = options.pageSize ?? null;
  const search = options.search?.trim() ?? "";

  const loadPatients = useCallback(async (signal?: AbortSignal) => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();

      if (!user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      if (activeWorkspaceError) {
        setError(activeWorkspaceError);
        setPatients([]);
        return;
      }

      if (!activeWorkspace?.id) {
        setError("No encontramos un espacio de trabajo activo.");
        setPatients([]);
        return;
      }

      let patientQuery = supabase
        .from("patients")
        .select(
          "id, assigned_professional_id, clinic_id, full_name, document_number, phone, email, initial_condition, status",
          { count: "exact" },
        )
        .order("status", { ascending: true })
        .order("full_name", { ascending: true });
      let activeCountQuery = supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");

      patientQuery = patientQuery.eq("workspace_id", activeWorkspace.id);
      activeCountQuery = activeCountQuery.eq("workspace_id", activeWorkspace.id);

      if (activeWorkspace.type === "PERSONAL") {
        patientQuery = patientQuery
          .eq("owner_id", user.id)
          .is("clinic_id", null);
        activeCountQuery = activeCountQuery
          .eq("owner_id", user.id)
          .is("clinic_id", null);
      } else if (activeWorkspace.role === "ADMIN") {
        patientQuery = patientQuery.eq(
          "clinic_id",
          activeWorkspace.sourceClinicId ?? "",
        );
        activeCountQuery = activeCountQuery.eq(
          "clinic_id",
          activeWorkspace.sourceClinicId ?? "",
        );
      } else {
        if (!activeWorkspace.sourceClinicId) {
          setPatients([]);
          setActivePatientCount(0);
          setTotalCount(0);
          return;
        }

        const baseClinicProfessionalQuery = supabase
          .from("clinic_professionals")
          .select("can_view_assigned_patients")
          .eq("clinic_id", activeWorkspace.sourceClinicId)
          .eq("professional_id", user.id)
          .eq("status", "active");
        const clinicProfessionalQuery = signal
          ? baseClinicProfessionalQuery.abortSignal(signal)
          : baseClinicProfessionalQuery;
        const { data: clinicProfessional, error: clinicProfessionalError } =
          await clinicProfessionalQuery.maybeSingle();

        if (signal?.aborted) {
          return;
        }

        if (clinicProfessionalError) {
          setError(mapSupabaseError(clinicProfessionalError));
          setPatients([]);
          return;
        }

        if (
          !(
            clinicProfessional as ClinicProfessionalAccessRow | null
          )?.can_view_assigned_patients
        ) {
          setPatients([]);
          setActivePatientCount(0);
          setTotalCount(0);
          return;
        }

        patientQuery = patientQuery
          .eq("clinic_id", activeWorkspace.sourceClinicId)
          .eq("assigned_professional_id", user.id);
        activeCountQuery = activeCountQuery
          .eq("clinic_id", activeWorkspace.sourceClinicId)
          .eq("assigned_professional_id", user.id);
      }

      const normalizedSearch = search.toLowerCase().replace(/[,%]/g, " ").trim();

      if (normalizedSearch) {
        const searchFilters = [
          `full_name.ilike.%${normalizedSearch}%`,
          `document_number.ilike.%${normalizedSearch}%`,
          `initial_condition.ilike.%${normalizedSearch}%`,
          `email.ilike.%${normalizedSearch}%`,
          `phone.ilike.%${normalizedSearch}%`,
        ];

        if ("activo".includes(normalizedSearch)) {
          searchFilters.push("status.eq.active");
        }

        if ("inactivo".includes(normalizedSearch)) {
          searchFilters.push("status.eq.inactive");
        }

        patientQuery = patientQuery.or(searchFilters.join(","));
      }

      if (pageSize) {
        const from = (page - 1) * pageSize;
        patientQuery = patientQuery.range(from, from + pageSize - 1);
      }

      const abortablePatientQuery = signal
        ? patientQuery.abortSignal(signal)
        : patientQuery;
      const abortableActiveCountQuery = signal
        ? activeCountQuery.abortSignal(signal)
        : activeCountQuery;
      const [
        { data, error: queryError, count },
        { count: activeCount, error: activeCountError },
      ] = await Promise.all([abortablePatientQuery, abortableActiveCountQuery]);


      if (signal?.aborted) {
        return;
      }

      if (queryError || activeCountError) {
        setError(mapSupabaseError(queryError ?? activeCountError));
        return;
      }

      const patientRows = (data ?? []) as PatientRow[];
      const patientIds = patientRows.map((patient) => patient.id);

      if (patientIds.length === 0) {
        setTotalCount(count ?? patientRows.length);
        setActivePatientCount(activeCount ?? 0);
        setPatients([]);
        return;
      }

      let appointmentsQuery = supabase
        .from("appointments")
        .select("patient_id, scheduled_at, status, payment_status")
        .in("patient_id", patientIds);
      let evolutionsQuery = supabase
        .from("evolutions")
        .select("patient_id, session_date, clinical_notes")
        .in("patient_id", patientIds);

      appointmentsQuery = appointmentsQuery.eq("workspace_id", activeWorkspace.id);
      evolutionsQuery = evolutionsQuery.eq("workspace_id", activeWorkspace.id);

      const abortableAppointmentsQuery = signal
        ? appointmentsQuery.abortSignal(signal)
        : appointmentsQuery;
      const abortableEvolutionsQuery = signal
        ? evolutionsQuery.abortSignal(signal)
        : evolutionsQuery;
      const [
        { data: appointmentsData, error: appointmentsError },
        { data: evolutionsData, error: evolutionsError },
      ] = await Promise.all([
        abortableAppointmentsQuery,
        abortableEvolutionsQuery,
      ]);

      if (signal?.aborted) {
        return;
      }

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

      setTotalCount(count ?? patientRows.length);
      setActivePatientCount(activeCount ?? 0);
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
      if (signal?.aborted) {
        return;
      }

      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar pacientes."),
      );
    } finally {
      if (!signal?.aborted) {
        setLoaded(true);
      }
    }
  }, [
    activeWorkspace?.id,
    activeWorkspace?.role,
    activeWorkspace?.sourceClinicId,
    activeWorkspace?.type,
    activeWorkspaceError,
    activeWorkspaceLoaded,
    page,
    pageSize,
    search,
    user,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    void loadPatients(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadPatients]);

  const activePatients = useMemo(
    () =>
      patients.filter(
        (patient) =>
          patient.status === "Activo" &&
          (activeWorkspace?.type === "CLINICA"
            ? Boolean(patient.clinicId)
            : !patient.clinicId),
      ),
    [activeWorkspace?.type, patients],
  );

  async function findDuplicatePatient(params: {
    document: string;
    excludePatientId?: string;
    workspaceId: string;
  }) {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("patients")
      .select("id, full_name")
      .eq("workspace_id", params.workspaceId)
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

    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    let clinicId: string | null = activeWorkspace.sourceClinicId;

    if (!clinicId && accountType === "CONSULTORIO") {
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
      workspaceId: activeWorkspace.id,
    });

    if (duplicatePatient) {
      throw new Error(
        `Ya tenés un paciente registrado con ese DNI: ${duplicatePatient.full_name}`,
      );
    }

    const { data: insertedPatient, error: insertError } = await supabase
      .from("patients")
      .insert({
        assigned_professional_id:
          activeWorkspace.type === "CLINICA"
            ? normalizedInput.assignedProfessionalId || null
            : null,
        owner_id: sessionData.user.id,
        workspace_id: activeWorkspace.id,
        clinic_id: clinicId,
        full_name: normalizedInput.name,
        document_number: normalizedInput.document,
        phone: normalizedInput.phone || null,
        email: normalizedInput.email || null,
        initial_condition: normalizedInput.condition,
        status: mapPatientStatusToDb(normalizedInput.status),
      })
      .select("id")
      .single();

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadPatients();
    return (insertedPatient as { id: string }).id;
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
      workspaceId: activeWorkspace?.id ?? "",
    });

    if (duplicatePatient) {
      throw new Error(
        `Ya tenés un paciente registrado con ese DNI: ${duplicatePatient.full_name}`,
      );
    }

    const { error: updateError } = await supabase
      .from("patients")
      .update({
        assigned_professional_id:
          activeWorkspace?.type === "CLINICA"
            ? normalizedInput.assignedProfessionalId || null
            : null,
        document_number: normalizedInput.document,
        email: normalizedInput.email || null,
        full_name: normalizedInput.name,
        initial_condition: normalizedInput.condition,
        phone: normalizedInput.phone || null,
        status: mapPatientStatusToDb(normalizedInput.status),
      })
      .eq("workspace_id", activeWorkspace?.id ?? "")
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
      .eq("workspace_id", activeWorkspace?.id ?? "")
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadPatients();
  }

  async function reactivatePatient(id: string) {
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
        disabled_at: null,
        status: "active",
      })
      .eq("workspace_id", activeWorkspace?.id ?? "")
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadPatients();
  }

  return {
    activePatients,
    activePatientCount,
    addPatient,
    disablePatient,
    error,
    loaded,
    page,
    pageSize,
    patients,
    reactivatePatient,
    refreshPatients: loadPatients,
    totalCount,
    updatePatient,
  };
}
