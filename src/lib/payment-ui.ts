import type { Appointment } from "@/hooks/useAppointments";

export const paymentStatusStyles: Record<string, string> = {
  Pendiente: "bg-amber-50 text-amber-700",
  Cobrado: "bg-emerald-50 text-emerald-700",
  Bonificado: "bg-sky-50 text-sky-700",
  "No corresponde": "bg-slate-100 text-slate-700",
};

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value || 0);
}

export function getPaymentDate(appointment: Appointment) {
  return appointment.paidAt
    ? new Date(`${appointment.paidAt}T00:00:00`)
    : new Date(appointment.scheduledAt);
}

export function isAttendedPendingPayment(appointment: Appointment) {
  return appointment.status === "Asistió" && appointment.paymentStatus === "pending";
}
