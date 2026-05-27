"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export type Appointment = {
  id: string;
  patientId: string;
  scheduledAt: string;
  date: string;
  time: string;
  patient: string;
  reason: string;
  status: string;
  modality: string;
  duration: string;
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
  session_amount: number | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  payment_notes: string | null;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
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

  return {
    id: row.id,
    patientId: row.patient_id,
    scheduledAt: row.scheduled_at,
    date: date.toLocaleDateString("es-AR"),
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

export function useAppointments(patientId?: string) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadAppointments = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      let query = supabase
        .from("appointments")
        .select(
          "id, patient_id, scheduled_at, duration_minutes, modality, reason, status, session_amount, payment_status, payment_method, paid_at, payment_notes, patients(full_name)",
        )
        .order("scheduled_at", { ascending: true });

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
  }, [patientId]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  async function addAppointment(input: NewAppointmentInput) {
    const supabase = getSupabaseClient();
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getUser();

    if (sessionError || !sessionData.user) {
      throw new Error("No pudimos identificar al usuario.");
    }

    const scheduledAt = new Date(`${input.date}T${input.time}`).toISOString();
    const { error: insertError } = await supabase.from("appointments").insert({
      owner_id: sessionData.user.id,
      patient_id: input.patientId,
      scheduled_at: scheduledAt,
      duration_minutes: input.durationMinutes,
      modality: input.modality,
      reason: input.reason,
      notes: input.notes || null,
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
    appointments,
    error,
    loaded,
    rescheduleAppointment,
    refreshAppointments: loadAppointments,
    updateAppointmentStatus,
    updateAppointmentPayment,
  };
}
