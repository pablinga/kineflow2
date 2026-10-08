"use client";

import { useCallback, useState } from "react";
import type { Appointment, AppointmentStatus } from "@/hooks/useAppointments";
import type { AppointmentStatusCode } from "@/lib/appointment-ui";
import { getFriendlyErrorMessage } from "@/lib/error-messages";

type AttendanceStatus = "attended" | "no_show";

export type AttendanceChange = {
  appointment: Appointment;
  message: string;
  /** Estado al que vuelve "Deshacer"; null si no se puede deshacer. */
  previousStatus: AppointmentStatus | "confirmed" | null;
};

type UseAttendanceActionsOptions = {
  updateAppointmentStatus: (
    id: string,
    status: AppointmentStatus | "confirmed",
  ) => Promise<unknown>;
  isProfessionalClinicAppointment: (appointment: Appointment) => boolean;
  /** Mensaje de bloqueo (solo lectura) o null si puede escribir. */
  getWriteBlockMessage: (appointment: Appointment) => string | null;
  /** Después de marcar "Asistió" (por ejemplo, abrir el cobro). */
  onAttended?: (appointment: Appointment) => void;
  /** Después de deshacer (por ejemplo, cerrar el cobro que se abrió). */
  onUndone?: (appointment: Appointment) => void;
};

function toRevertibleStatus(
  status: AppointmentStatusCode,
): AppointmentStatus | "confirmed" {
  return status === "completed" ? "attended" : status;
}

export function isFutureAppointment(appointment: Appointment) {
  return new Date(appointment.scheduledAt).getTime() > Date.now();
}

/**
 * Asistió / No asistió en un toque, sin confirmación, con "Deshacer". Lo
 * comparten Inicio y la Agenda para que las reglas sean las mismas: no se
 * marca un turno futuro, se respeta el modo solo lectura, y un turno de
 * clínica visto por el profesional solo se puede deshacer entre Asistió y
 * No asistió (la API no le deja volverlo a pendiente).
 */
export function useAttendanceActions({
  getWriteBlockMessage,
  isProfessionalClinicAppointment,
  onAttended,
  onUndone,
  updateAppointmentStatus,
}: UseAttendanceActionsOptions) {
  const [updatingId, setUpdatingId] = useState("");
  const [error, setError] = useState("");
  const [lastChange, setLastChange] = useState<AttendanceChange | null>(null);

  const dismissChange = useCallback(() => setLastChange(null), []);

  async function markAttendance(
    appointment: Appointment,
    status: AttendanceStatus,
  ) {
    setError("");

    if (isFutureAppointment(appointment)) {
      setError("No se puede registrar asistencia o ausencia en un turno futuro.");
      return;
    }

    const blockMessage = getWriteBlockMessage(appointment);

    if (blockMessage) {
      setError(blockMessage);
      return;
    }

    const previous = toRevertibleStatus(appointment.rawStatus);

    if (previous === status) {
      return;
    }

    const canUndo =
      !isProfessionalClinicAppointment(appointment) ||
      previous === "attended" ||
      previous === "no_show";

    setUpdatingId(appointment.id);

    try {
      await updateAppointmentStatus(appointment.id, status);
      setLastChange({
        appointment,
        message:
          status === "attended"
            ? `${appointment.patient}: asistió`
            : `${appointment.patient}: no asistió`,
        previousStatus: canUndo ? previous : null,
      });

      if (status === "attended") {
        onAttended?.(appointment);
      }
    } catch (updateError) {
      setError(
        getFriendlyErrorMessage(updateError, "No pudimos actualizar el turno."),
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function undoLastChange() {
    const change = lastChange;

    if (!change?.previousStatus) {
      return;
    }

    setError("");

    try {
      await updateAppointmentStatus(change.appointment.id, change.previousStatus);
      onUndone?.(change.appointment);
    } catch (undoError) {
      setError(
        getFriendlyErrorMessage(undoError, "No pudimos deshacer el cambio."),
      );
    }
  }

  return {
    dismissChange,
    error,
    lastChange,
    markAttendance,
    setError,
    undoLastChange,
    updatingId,
  };
}
