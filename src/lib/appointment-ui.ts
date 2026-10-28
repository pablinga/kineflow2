export type AppointmentStatusCode =
  | "pending"
  | "attended"
  | "cancelled"
  | "no_show"
  | "rescheduled"
  | "confirmed"
  | "completed"
  | "awaiting_payment";

export const appointmentStatusLabels: Record<AppointmentStatusCode, string> = {
  attended: "Asistió",
  // Reserva online esperando el pago de la seña: bloquea el horario.
  awaiting_payment: "Seña pendiente",
  cancelled: "Cancelado",
  completed: "Asistió",
  confirmed: "Pendiente",
  no_show: "No asistió",
  pending: "Pendiente",
  rescheduled: "Reprogramado",
};

export const appointmentStatusStyles: Record<string, string> = {
  Pendiente: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  Asistió: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  Cancelado: "bg-red-50 text-red-800 ring-1 ring-red-200",
  "No asistió": "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  Reprogramado: "bg-ocean-50 text-ocean-900 ring-1 ring-ocean-200",
  "Seña pendiente": "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
  "Sin registrar asistencia":
    "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
};

export const activeAppointmentStatuses = new Set([
  "Pendiente",
  "Reprogramado",
  "Seña pendiente",
  "Sin registrar asistencia",
]);

export function isPastPendingAppointment(appointment: {
  scheduledAt: string;
  status: string;
}) {
  return (
    appointment.status === "Pendiente" &&
    new Date(appointment.scheduledAt).getTime() < Date.now()
  );
}

export function getAppointmentDisplayStatus(appointment: {
  scheduledAt: string;
  status: string;
}) {
  return isPastPendingAppointment(appointment)
    ? "Sin registrar asistencia"
    : appointment.status;
}

/** Un turno futuro todavía no admite Asistió / No asistió. */
export function isFutureAppointment(appointment: { scheduledAt: string }) {
  return new Date(appointment.scheduledAt).getTime() > Date.now();
}

export function isUpcomingActiveAppointment(appointment: {
  scheduledAt: string;
  status: string;
}) {
  return (
    activeAppointmentStatuses.has(getAppointmentDisplayStatus(appointment)) &&
    new Date(appointment.scheduledAt).getTime() >= Date.now()
  );
}
