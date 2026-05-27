import type { Appointment } from "@/hooks/useAppointments";
import { formatCurrency } from "@/lib/format";

export const paymentStatusStyles: Record<string, string> = {
  Pendiente: "bg-amber-50 text-amber-700",
  Cobrado: "bg-emerald-50 text-emerald-700",
  Bonificado: "bg-sky-50 text-sky-700",
  "No corresponde": "bg-slate-100 text-slate-700",
};

export { formatCurrency };

export function getPaymentDate(appointment: Appointment) {
  return appointment.paidAt
    ? new Date(`${appointment.paidAt}T00:00:00`)
    : new Date(appointment.scheduledAt);
}

export function isAttendedPendingPayment(appointment: Appointment) {
  return (
    appointment.status === "Asistió" &&
    appointment.paymentStatus === "pending" &&
    appointment.amount > 0
  );
}
