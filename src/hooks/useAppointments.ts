"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";
import { appointmentStatusLabels } from "@/lib/appointment-ui";
import { useActiveClinic } from "@/hooks/useActiveClinic";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";

export type Appointment = {
  id: string;
  workspaceId: string | null;
  patientId: string;
  scheduledAt: string;
  durationMinutes: number;
  date: string;
  time: string;
  patient: string;
  reason: string;
  conflictWarning: string | null;
  status: string;
  modality: string;
  duration: string;
  origin: AppointmentOrigin;
  clinicId: string | null;
  clinicProfessionalId: string | null;
  clinicName: string | null;
  originLabel: string;
  originColor: string;
  sessionNumber: number | null;
  treatmentId: string | null;
  amount: number;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  paymentMethod: PaymentMethod | "";
  paymentMethodLabel: string;
  paidAt: string | null;
  paymentNotes: string;
};

export type AppointmentStatus =
  | "pending"
  | "attended"
  | "cancelled"
  | "no_show"
  | "rescheduled";

export type AppointmentOrigin = "independent" | "clinic";
export type AppointmentModality = "presencial" | "domicilio" | "virtual";
export type PaymentStatus = "pending" | "paid" | "waived" | "not_applicable";
export type PaymentMethod =
  | "cash"
  | "transfer"
  | "mercado_pago"
  | "insurance"
  | "other";

export type NewAppointmentInput = {
  patientId: string;
  date: string;
  time: string;
  reason?: string;
  durationMinutes: number;
  modality: AppointmentModality;
  notes: string;
  sessionNumber?: number | null;
  treatmentId?: string;
};

export type NewClinicAppointmentInput = NewAppointmentInput & {
  clinicId: string;
  clinicProfessionalId: string;
  professionalId: string;
};

export type AppointmentPaymentInput = {
  amount: number;
  paymentMethod: PaymentMethod | "";
  paymentNotes: string;
};

type AppointmentRow = {
  id: string;
  workspace_id: string | null;
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  modality: AppointmentModality;
  reason: string;
  status: AppointmentStatus | "confirmed" | "completed";
  appointment_origin: AppointmentOrigin | null;
  clinic_id: string | null;
  clinic_professional_id: string | null;
  session_amount: number | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  payment_notes: string | null;
  session_number: number | null;
  treatment_id: string | null;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
  clinics: { name: string; color: string } | Array<{ name: string; color: string }> | null;
  clinic_professionals:
    | { color: string }
    | Array<{ color: string }>
    | null;
};

type AvailabilityRow = {
  starts_at: string;
  ends_at: string;
  weekday: number;
  valid_from: string | null;
  valid_to: string | null;
  clinic_professionals:
    | {
        status: string;
        clinics: { name: string } | Array<{ name: string }> | null;
      }
    | Array<{
        status: string;
        clinics: { name: string } | Array<{ name: string }> | null;
      }>
    | null;
};

const modalityLabels: Record<AppointmentModality, string> = {
  presencial: "Presencial",
  domicilio: "Domicilio",
  virtual: "Virtual",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Cobrado",
  waived: "Bonificado",
  not_applicable: "No corresponde",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  mercado_pago: "Mercado Pago",
  insurance: "Obra social",
  other: "Otro",
};

function mapAppointment(row: AppointmentRow): Appointment {
  const date = new Date(row.scheduled_at);
  const patient = Array.isArray(row.patients) ? row.patients[0] : row.patients;
  const clinic = Array.isArray(row.clinics) ? row.clinics[0] : row.clinics;
  const clinicProfessional = Array.isArray(row.clinic_professionals)
    ? row.clinic_professionals[0]
    : row.clinic_professionals;
  const origin = row.appointment_origin ?? "independent";

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    patientId: row.patient_id,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    date: formatDate(date),
    time: date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
    patient: patient?.full_name ?? "Paciente",
    reason: row.reason,
    conflictWarning: null,
    status: appointmentStatusLabels[row.status],
    modality: modalityLabels[row.modality],
    duration: `${row.duration_minutes} min`,
    origin,
    clinicId: row.clinic_id,
    clinicProfessionalId: row.clinic_professional_id,
    clinicName: clinic?.name ?? null,
    originLabel: origin === "clinic" ? clinic?.name ?? "Consultorio" : "Propio",
    originColor:
      origin === "clinic"
        ? clinicProfessional?.color ?? clinic?.color ?? "#14b8a6"
        : "#0b97dc",
    sessionNumber: row.session_number,
    treatmentId: row.treatment_id,
    amount: Number(row.session_amount ?? 0),
    paymentStatus: row.payment_status ?? "pending",
    paymentStatusLabel: paymentStatusLabels[row.payment_status ?? "pending"],
    paymentMethod: row.payment_method ?? "",
    paymentMethodLabel: row.payment_method
      ? paymentMethodLabels[row.payment_method]
      : "Sin medio",
    paidAt: row.paid_at,
    paymentNotes: row.payment_notes ?? "",
  };
}

function getAppointmentEnd(appointment: Appointment) {
  return (
    new Date(appointment.scheduledAt).getTime() +
    appointment.durationMinutes * 60 * 1000
  );
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart < rightEnd && leftEnd > rightStart;
}

function formatTimeRange(start: Date, durationMinutes: number) {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${formatter.format(start)} a ${formatter.format(end)}`;
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toLocalDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getClinicNameFromAvailability(row: AvailabilityRow) {
  const link = Array.isArray(row.clinic_professionals)
    ? row.clinic_professionals[0]
    : row.clinic_professionals;
  const clinic = Array.isArray(link?.clinics)
    ? link?.clinics[0]
    : link?.clinics;

  return clinic?.name ?? "el consultorio";
}

function getConflictMessage(conflict: Appointment) {
  const range = formatTimeRange(
    new Date(conflict.scheduledAt),
    conflict.durationMinutes,
  );

  if (conflict.origin === "clinic" && conflict.clinicName) {
    return `Hay otro turno de ${range} en ${conflict.clinicName}.`;
  }

  return `Hay otro turno asignado de ${range}.`;
}

function findAppointmentConflict(
  appointments: Appointment[],
  params: {
    durationMinutes: number;
    ignoreAppointmentId?: string;
    scheduledAt: string;
  },
) {
  const start = new Date(params.scheduledAt);
  const startTime = start.getTime();
  const endTime = startTime + params.durationMinutes * 60 * 1000;

  return appointments.find((appointment) => {
    if (appointment.id === params.ignoreAppointmentId) {
      return false;
    }

    if (appointment.status === "Cancelado") {
      return false;
    }

    return overlaps(
      startTime,
      endTime,
      new Date(appointment.scheduledAt).getTime(),
      getAppointmentEnd(appointment),
    );
  });
}

function markAppointmentConflicts(appointments: Appointment[]) {
  return appointments.map((appointment) => {
    const conflict = findAppointmentConflict(appointments, {
      durationMinutes: appointment.durationMinutes,
      ignoreAppointmentId: appointment.id,
      scheduledAt: appointment.scheduledAt,
    });

    return {
      ...appointment,
      conflictWarning: conflict ? getConflictMessage(conflict) : null,
    };
  });
}

export function useAppointments(patientId?: string) {
  const { accountType, user } = useRequireAuth();
  const {
    activeWorkspace,
    error: activeWorkspaceError,
    loaded: activeWorkspaceLoaded,
  } = useActiveWorkspace();
  const { plan } = useSubscriptionPlan();
  const { clinic: activeClinic } = useActiveClinic(
    accountType === "CONSULTORIO",
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadAppointments = useCallback(async (signal?: AbortSignal) => {
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

      let query = supabase
        .from("appointments")
        .select(
          "id, workspace_id, patient_id, scheduled_at, duration_minutes, modality, reason, status, appointment_origin, clinic_id, clinic_professional_id, treatment_id, session_number, session_amount, payment_status, payment_method, paid_at, payment_notes, patients(full_name), clinics(name, color), clinic_professionals(color)",
        )
        .order("scheduled_at", { ascending: true });

      if (activeWorkspaceError) {
        setError(activeWorkspaceError);
        setAppointments([]);
        return;
      }

      if (!activeWorkspace?.id) {
        setError("No encontramos un espacio de trabajo activo.");
        setAppointments([]);
        return;
      }

      query = query.eq("workspace_id", activeWorkspace.id);

      if (
        activeWorkspace.type === "PERSONAL" ||
        activeWorkspace.role === "KINESIOLOGO"
      ) {
        query = query.eq("owner_id", user.id);
      }

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const abortableQuery = signal ? query.abortSignal(signal) : query;
      const { data, error: queryError } = await abortableQuery;

      if (signal?.aborted) {
        return;
      }

      if (queryError) {
        setError(mapSupabaseError(queryError));
        return;
      }

      setAppointments(
        markAppointmentConflicts(
          ((data ?? []) as unknown as AppointmentRow[]).map(mapAppointment),
        ),
      );
    } catch (loadError) {
      if (signal?.aborted) {
        return;
      }

      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar turnos."),
      );
    } finally {
      if (!signal?.aborted) {
        setLoaded(true);
      }
    }
  }, [
    activeWorkspace?.id,
    activeWorkspace?.role,
    activeWorkspace?.type,
    activeWorkspaceError,
    activeWorkspaceLoaded,
    patientId,
    user,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    void loadAppointments(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadAppointments]);

  async function validateAppointmentSlot({
    durationMinutes,
    ignoreAppointmentId,
    scheduledAt,
  }: {
    durationMinutes: number;
    ignoreAppointmentId?: string;
    scheduledAt: string;
  }) {
    const start = new Date(scheduledAt);
    const startTime = start.getTime();
    const endTime = startTime + durationMinutes * 60 * 1000;
    const conflict = findAppointmentConflict(appointments, {
      durationMinutes,
      ignoreAppointmentId,
      scheduledAt,
    });
    const conflictWarning = conflict ? getConflictMessage(conflict) : null;

    const weekday = start.getDay();
    const date = toLocalDateValue(start);
    const startMinutes = start.getHours() * 60 + start.getMinutes();
    const end = new Date(endTime);
    const endMinutes = end.getHours() * 60 + end.getMinutes();
    const supabase = getSupabaseClient();
    const { data, error: availabilityError } = await supabase
      .from("clinic_professional_availability")
      .select(
        "weekday, starts_at, ends_at, valid_from, valid_to, clinic_professionals!inner(status, clinics(name))",
      )
      .eq("active", true)
      .eq("weekday", weekday);

    if (availabilityError) {
      return conflictWarning;
    }

    const reservedAvailability = ((data ?? []) as unknown as AvailabilityRow[])
      .find((availability) => {
        const link = Array.isArray(availability.clinic_professionals)
          ? availability.clinic_professionals[0]
          : availability.clinic_professionals;

        if (link?.status !== "accepted") {
          return false;
        }

        if (availability.valid_from && date < availability.valid_from) {
          return false;
        }

        if (availability.valid_to && date > availability.valid_to) {
          return false;
        }

        return overlaps(
          startMinutes,
          endMinutes,
          parseTimeToMinutes(availability.starts_at),
          parseTimeToMinutes(availability.ends_at),
        );
      });

    if (reservedAvailability) {
      throw new Error(
        `Este horario está reservado para ${getClinicNameFromAvailability(
          reservedAvailability,
        )}. En esta franja solo podés atender pacientes asignados por ese consultorio.`,
      );
    }

    return conflictWarning;
  }

  async function addAppointment(input: NewAppointmentInput) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio de trabajo activo.");
    }

    let activePatientCount = 0;

    if (plan.limitePacientes !== null) {
      let activePatientsQuery = supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", activeWorkspace.id)
        .eq("status", "active");

      if (activeWorkspace.type === "PERSONAL") {
        activePatientsQuery = activePatientsQuery
          .eq("owner_id", sessionData.user.id)
          .is("clinic_id", null);
      }

      const { count, error: countError } = await activePatientsQuery;

      if (countError) {
        throw new Error(mapSupabaseError(countError));
      }

      activePatientCount = count ?? 0;
    }

    const patientLimitBlock = getPatientPlanLimitBlock({
      activePatientCount,
      patientLimit: plan.limitePacientes,
    });

    if (patientLimitBlock) {
      throw new Error(patientLimitBlock);
    }

    const scheduledAt = new Date(`${input.date}T${input.time}`).toISOString();
    await validateAppointmentSlot({
      durationMinutes: input.durationMinutes,
      scheduledAt,
    });

    const { error: insertError } = await supabase.from("appointments").insert({
      owner_id: sessionData.user.id,
      workspace_id: activeWorkspace.id,
      patient_id: input.patientId,
      scheduled_at: scheduledAt,
      duration_minutes: input.durationMinutes,
      modality: input.modality,
      reason: input.reason?.trim() || "Sesion",
      notes: input.notes || null,
      appointment_origin: "independent",
      treatment_id: input.treatmentId || null,
      session_number: input.sessionNumber ?? null,
      status: "pending",
    });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadAppointments();
  }

  async function addClinicAppointment(input: NewClinicAppointmentInput) {
    const scheduledAt = new Date(`${input.date}T${input.time}`).toISOString();
    const supabase = getSupabaseClient();
    const { error: insertError } = await supabase.from("appointments").insert({
      owner_id: input.professionalId,
      workspace_id: activeWorkspace?.id ?? null,
      patient_id: input.patientId,
      scheduled_at: scheduledAt,
      duration_minutes: input.durationMinutes,
      modality: input.modality,
      reason: input.reason?.trim() || "Sesion",
      notes: input.notes || null,
      appointment_origin: "clinic",
      clinic_id: input.clinicId,
      clinic_professional_id: input.clinicProfessionalId,
      status: "pending",
    });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadAppointments();
  }

  async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
  ): Promise<{ treatmentCompleted?: { totalSessions: number } | null }> {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const response = await fetch("/api/appointments/status", {
      body: JSON.stringify({ appointmentId: id, status }),
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        getFriendlyErrorMessage(result.error, "No pudimos actualizar el turno."),
      );
    }

    await loadAppointments();
    return result;
  }

  async function rescheduleAppointment(id: string, date: string, time: string) {
    const supabase = getSupabaseClient();
    const scheduledAt = new Date(`${date}T${time}`).toISOString();
    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (currentAppointment?.origin === "independent") {
      await validateAppointmentSlot({
        durationMinutes: currentAppointment.durationMinutes,
        ignoreAppointmentId: id,
        scheduledAt,
      });
    }

    let query = supabase
      .from("appointments")
      .update({
        scheduled_at: scheduledAt,
        status: "rescheduled",
      })
      .eq("id", id);

    if (currentAppointment?.workspaceId) {
      query = query.eq("workspace_id", currentAppointment.workspaceId);
    } else if (accountType === "CONSULTORIO") {
      query = query.eq("clinic_id", activeClinic?.id ?? "");
    } else {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      query = query.eq("owner_id", sessionData.user.id);
    }

    const { error: updateError } = await query;

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadAppointments();
  }

  async function updateAppointmentPayment(
    id: string,
    input: AppointmentPaymentInput,
  ) {
    const supabase = getSupabaseClient();
    let query = supabase
      .from("appointments")
      .update({
        session_amount: input.amount || 0,
        payment_status: "paid",
        payment_method: input.paymentMethod || null,
        paid_at: new Date().toISOString(),
        payment_notes: input.paymentNotes || null,
      })
      .eq("id", id);

    const currentAppointment = appointments.find(
      (appointment) => appointment.id === id,
    );

    if (currentAppointment?.workspaceId) {
      query = query.eq("workspace_id", currentAppointment.workspaceId);
    } else if (accountType === "CONSULTORIO") {
      query = query.eq("clinic_id", activeClinic?.id ?? "");
    } else {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      query = query.eq("owner_id", sessionData.user.id);
    }

    const { error: updateError } = await query;

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadAppointments();
  }

  return {
    addAppointment,
    addClinicAppointment,
    appointments,
    error,
    loaded,
    rescheduleAppointment,
    refreshAppointments: loadAppointments,
    updateAppointmentStatus,
    updateAppointmentPayment,
  };
}
