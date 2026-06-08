import type { Appointment } from "@/hooks/useAppointments";

export const appointmentStatusStyles: Record<string, string> = {
  Pendiente: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  Asistió: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  Cancelado: "bg-red-50 text-red-800 ring-1 ring-red-200",
  "No asistió": "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  Reprogramado: "bg-ocean-50 text-ocean-900 ring-1 ring-ocean-200",
  "Sin registrar asistencia":
    "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
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
