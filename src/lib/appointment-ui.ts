import type { Appointment } from "@/hooks/useAppointments";

export const appointmentStatusStyles: Record<string, string> = {
  Pendiente: "bg-amber-50 text-amber-700",
  Asistió: "bg-emerald-50 text-emerald-700",
  Cancelado: "bg-red-50 text-red-700",
  "No asistió": "bg-rose-50 text-rose-700",
  Reprogramado: "bg-ocean-50 text-ocean-800",
  "Sin registrar asistencia": "bg-orange-50 text-orange-700",
};

export const activeAppointmentStatuses = new Set([
  "Pendiente",
  "Reprogramado",
  "Sin registrar asistencia",
]);

export function isPastPendingAppointment(appointment: Appointment) {
  return (
    appointment.status === "Pendiente" &&
    new Date(appointment.scheduledAt).getTime() < Date.now()
  );
}

export function getAppointmentDisplayStatus(appointment: Appointment) {
  return isPastPendingAppointment(appointment)
    ? "Sin registrar asistencia"
    : appointment.status;
}

export function isUpcomingActiveAppointment(appointment: Appointment) {
  return (
    activeAppointmentStatuses.has(getAppointmentDisplayStatus(appointment)) &&
    new Date(appointment.scheduledAt).getTime() >= Date.now()
  );
}
