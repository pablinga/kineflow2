"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { useActiveClinic } from "@/hooks/useActiveClinic";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export type Appointment = {
  id: string;
  patientId: string;
  scheduledAt: string;
  durationMinutes: number;
  date: string;
  time: string;
  patient: string;
  reason: string;
  status: string;
  modality: string;
  duration: string;
  origin: AppointmentOrigin;
  clinicId: string | null;
  clinicProfessionalId: string | null;
  clinicName: string | null;
  originLabel: string;
  originColor: string;
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
  reason: string;
  durationMinutes: number;
  modality: AppointmentModality;
  notes: string;
};

export type NewClinicAppointmentInput = NewAppointmentInput & {
  clinicId: string;
  clinicProfessionalId: string;
  professionalId: string;
};

export type AppointmentPaymentInput = {
  amount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | "";
  paidAt: string;
  paymentNotes: string;
};

type AppointmentRow = {
  id: string;
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

const statusLabels: Record<AppointmentRow["status"], string> = {
  pending: "Pendiente",
  attended: "Asistió",
  cancelled: "Cancelado",
  no_show: "No asistió",
  rescheduled: "Reprogramado",
  confirmed: "Pendiente",
  completed: "Asistió",
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
    status: statusLabels[row.status],
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

export function useAppointments(patientId?: string) {
  const { accountType } = useRequireAuth();
  const {
    clinic: activeClinic,
    error: activeClinicError,
    loaded: activeClinicLoaded,
  } = useActiveClinic(accountType === "CONSULTORIO");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadAppointments = useCallback(async () => {
    if (accountType === "CONSULTORIO" && !activeClinicLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from("appointments")
        .select(
          "id, patient_id, scheduled_at, duration_minutes, modality, reason, status, appointment_origin, clinic_id, clinic_professional_id, session_amount, payment_status, payment_method, paid_at, payment_notes, patients(full_name), clinics(name, color), clinic_professionals(color)",
        )
        .order("scheduled_at", { ascending: true });

      if (accountType === "CONSULTORIO") {
        if (activeClinicError) {
          setError(activeClinicError);
          setAppointments([]);
          return;
        }

        if (!activeClinic?.id) {
          setError("No encontramos un consultorio asociado a tu usuario.");
          setAppointments([]);
          return;
        }

        query = query.eq("clinic_id", activeClinic.id);
      } else {
        query = query.is("clinic_id", null);
      }

      if (patientId) {
        query = query.eq("patient_id", patientId);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(queryError.message);
        return;
      }

      setAppointments(
        ((data ?? []) as unknown as AppointmentRow[]).map(mapAppointment),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No pudimos cargar turnos.",
      );
    } finally {
      setLoaded(true);
    }
  }, [accountType, activeClinic?.id, activeClinicError, activeClinicLoaded, patientId]);

  useEffect(() => {
    loadAppointments();
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
    const conflict = appointments.find((appointment) => {
      if (appointment.id === ignoreAppointmentId) {
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

    if (conflict) {
      const range = formatTimeRange(
        new Date(conflict.scheduledAt),
        conflict.durationMinutes,
      );

      if (conflict.origin === "clinic" && conflict.clinicName) {
        throw new Error(
          `El kinesiólogo ya tiene un turno de ${range} en ${conflict.clinicName}.`,
        );
      }

      throw new Error(
        "El kinesiólogo ya tiene un turno asignado en ese horario. Revisá la agenda antes de confirmar.",
      );
    }

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
      return;
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
  }

  async function addAppointment(input: NewAppointmentInput) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const scheduledAt = new Date(`${input.date}T${input.time}`).toISOString();
    await validateAppointmentSlot({
      durationMinutes: input.durationMinutes,
      scheduledAt,
    });

    const { error: insertError } = await supabase.from("appointments").insert({
      owner_id: sessionData.user.id,
      patient_id: input.patientId,
      scheduled_at: scheduledAt,
      duration_minutes: input.durationMinutes,
      modality: input.modality,
      reason: input.reason,
      notes: input.notes || null,
      appointment_origin: "independent",
      status: "pending",
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await loadAppointments();
  }

  async function addClinicAppointment(input: NewClinicAppointmentInput) {
    const scheduledAt = new Date(`${input.date}T${input.time}`).toISOString();
    const supabase = getSupabaseClient();
    const { error: insertError } = await supabase.from("appointments").insert({
      owner_id: input.professionalId,
      patient_id: input.patientId,
      scheduled_at: scheduledAt,
      duration_minutes: input.durationMinutes,
      modality: input.modality,
      reason: input.reason,
      notes: input.notes || null,
      appointment_origin: "clinic",
      clinic_id: input.clinicId,
      clinic_professional_id: input.clinicProfessionalId,
      status: "pending",
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await loadAppointments();
  }

  async function updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
  ) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await loadAppointments();
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

    const { error: updateError } = await supabase
      .from("appointments")
      .update({
        scheduled_at: scheduledAt,
        status: "rescheduled",
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    await loadAppointments();
  }

  async function updateAppointmentPayment(
    id: string,
    input: AppointmentPaymentInput,
  ) {
    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("appointments")
      .update({
        session_amount: input.amount || 0,
        payment_status: input.paymentStatus,
        payment_method: input.paymentMethod || null,
        paid_at: input.paidAt || null,
        payment_notes: input.paymentNotes || null,
      })
      .eq("id", id);

    if (updateError) {
      throw new Error(updateError.message);
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
