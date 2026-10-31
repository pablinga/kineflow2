import Link from "next/link";
import type { ReactNode } from "react";
import { MoreVertical } from "lucide-react";
import type { Appointment } from "@/hooks/useAppointments";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
  isFutureAppointment,
} from "@/lib/appointment-ui";
import { getCoverageLabel, isPatientPaidAppointment } from "@/lib/payment-ui";
import { formatSessionAmount } from "@/lib/format";

type AgendaAppointmentRowProps = {
  appointment: Appointment;
  /** Deshabilita Asistió / No asistió mientras se guarda. */
  attendanceBusy?: boolean;
  canSeeAmounts: boolean;
  /** Turno de clínica visto por el profesional: sin cobro ni link a la ficha. */
  clinicAppointment: boolean;
  /** Acción de evolución ya armada (o null si no corresponde). */
  evolutionAction?: ReactNode;
  /** Chips extra después de los detalles (por ejemplo, la orden médica). */
  extraBadges?: ReactNode;
  onCharge: (appointment: Appointment) => void;
  onMarkAttendance: (appointment: Appointment, status: "attended" | "no_show") => void;
  onOpenActions: (appointment: Appointment) => void;
  /** Link a la ficha del paciente; null lo muestra como texto. */
  patientHref: string | null;
  showOrigin: boolean;
  showProfessional: boolean;
};

/**
 * Renglón de un turno en la lista del día (vista Día en el celular). Solo
 * presentación: los datos y las acciones los pone quien lo usa (la Agenda o
 * la demo pública con datos ficticios).
 */
export function AgendaAppointmentRow({
  appointment,
  attendanceBusy = false,
  canSeeAmounts,
  clinicAppointment,
  evolutionAction = null,
  extraBadges = null,
  onCharge,
  onMarkAttendance,
  onOpenActions,
  patientHref,
  showOrigin,
  showProfessional,
}: AgendaAppointmentRowProps) {
  const status = getAppointmentDisplayStatus(appointment);
  const isAttended = status === "Asistió";
  const canMarkAttendance =
    (status === "Pendiente" || status === "Sin registrar asistencia") &&
    !isFutureAppointment(appointment);
  const patientPaid = !clinicAppointment && isPatientPaidAppointment(appointment);
  const pendingCharge =
    patientPaid && isAttended && appointment.paymentStatus === "pending";
  const paymentLabel =
    patientPaid && (isAttended || appointment.paymentStatus !== "pending")
      ? appointment.paymentStatus === "pending"
        ? "Sin cobrar"
        : appointment.paymentStatusLabel
      : null;
  const details = [
    appointment.attentionTypeName,
    showProfessional ? appointment.professionalName ?? "Sin profesional asignado" : null,
    !clinicAppointment && !patientPaid ? getCoverageLabel(appointment) : null,
    patientPaid && canSeeAmounts ? formatSessionAmount(appointment.amount) : null,
  ].filter((value): value is string => Boolean(value));
  const hasActions = canMarkAttendance || pendingCharge || evolutionAction;

  return (
    <li className="flex gap-3 px-4 py-3.5 sm:px-6">
      <div className="w-12 shrink-0">
        <p className="text-[0.95rem] font-semibold text-ink">{appointment.time}</p>
        <p className="mt-0.5 text-xs text-slate-500">{appointment.duration}</p>
      </div>
      <div className="min-w-0 flex-1">
        {patientHref ? (
          <Link
            className="block truncate text-base font-semibold text-ink"
            href={patientHref}
            prefetch={false}
          >
            {appointment.patient}
          </Link>
        ) : (
          <p className="truncate text-base font-semibold text-ink">{appointment.patient}</p>
        )}
        <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[0.8rem] text-slate-500">
          <span
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${
              appointmentStatusStyles[status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {status}
          </span>
          {showOrigin ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: appointment.originColor }}
              />
              <span className="truncate">{appointment.originLabel}</span>
            </span>
          ) : null}
          {details.map((detail) => (
            <span className="before:mr-1.5 before:content-['·']" key={detail}>
              {detail}
            </span>
          ))}
          {extraBadges}
          {paymentLabel ? (
            <span
              className={`before:mr-1.5 before:content-['·'] ${
                appointment.paymentStatus === "pending" ? "font-semibold text-amber-700" : ""
              }`}
            >
              {paymentLabel}
            </span>
          ) : null}
        </p>
        {appointment.conflictWarning ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800">
            Conflicto de agenda: {appointment.conflictWarning}
          </p>
        ) : null}
        {hasActions ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {canMarkAttendance ? (
              <>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors duration-150 ease-out active:bg-emerald-700 disabled:opacity-60"
                  disabled={attendanceBusy}
                  onClick={() => onMarkAttendance(appointment, "attended")}
                  type="button"
                >
                  Asistió
                </button>
                <button
                  className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors duration-150 ease-out active:bg-slate-50 disabled:opacity-60"
                  disabled={attendanceBusy}
                  onClick={() => onMarkAttendance(appointment, "no_show")}
                  type="button"
                >
                  No asistió
                </button>
              </>
            ) : null}
            {pendingCharge ? (
              <button
                className="inline-flex h-9 items-center justify-center rounded-full bg-ocean-50 px-4 text-sm font-semibold text-ocean-800 transition-colors duration-150 ease-out active:bg-ocean-100"
                onClick={() => onCharge(appointment)}
                type="button"
              >
                Cobrar
              </button>
            ) : null}
            {evolutionAction}
          </div>
        ) : null}
      </div>
      <div className="-mr-2 -mt-1.5 shrink-0">
        <button
          aria-label={`Acciones del turno de ${appointment.patient}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors duration-150 ease-out active:bg-slate-100"
          onClick={() => onOpenActions(appointment)}
          type="button"
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
    </li>
  );
}
