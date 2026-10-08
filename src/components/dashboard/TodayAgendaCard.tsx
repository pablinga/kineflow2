"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Wallet, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { UndoToast } from "@/components/ui/UndoToast";
import { AppointmentPaymentModal } from "@/components/turnos/AppointmentPaymentModal";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import {
  type Appointment,
  type AppointmentPaymentInput,
  useAppointments,
} from "@/hooks/useAppointments";
import {
  isFutureAppointment,
  useAttendanceActions,
} from "@/hooks/useAttendanceActions";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
} from "@/lib/appointment-ui";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import {
  formatCurrency,
  getCoverageLabel,
  isPatientPaidAppointment,
  paymentStatusStyles,
} from "@/lib/payment-ui";

function isToday(value: string) {
  const date = new Date(value);
  const today = new Date();

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

type TodayAgendaCardProps = {
  /** Mensaje de solo lectura, o null si puede registrar asistencia y cobros. */
  readOnlyMessage: string | null;
};

/**
 * Agenda de hoy en Inicio: todos los turnos del día (también los que ya
 * pasaron) con Asistió / No asistió / Cobrar en la misma fila. Usa las mismas
 * reglas que la Agenda (useAttendanceActions) y carga sin bloquear la página.
 */
export function TodayAgendaCard({ readOnlyMessage }: TodayAgendaCardProps) {
  const { accountType } = useRequireAuth();
  const { activeWorkspace } = useActiveWorkspace();
  const {
    appointments,
    error: appointmentsError,
    initialLoaded: loaded,
    updateAppointmentPayment,
    updateAppointmentStatus,
  } = useAppointments(undefined, {
    // Igual que la Agenda: el kinesiólogo ve también sus turnos de clínica.
    unified: accountType === "KINESIOLOGO" && activeWorkspace?.type !== "CLINICA",
  });
  const [paying, setPaying] = useState<Appointment | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const isProfessionalClinicAppointment = (appointment: Appointment) =>
    appointment.origin === "clinic" && activeWorkspace?.type !== "CLINICA";
  const canCharge = (appointment: Appointment) =>
    !isProfessionalClinicAppointment(appointment) &&
    isPatientPaidAppointment(appointment);
  const attendance = useAttendanceActions({
    getWriteBlockMessage: (appointment) =>
      isProfessionalClinicAppointment(appointment) ? null : readOnlyMessage,
    isProfessionalClinicAppointment,
    onAttended: (appointment) => {
      if (canCharge(appointment) && appointment.paymentStatus === "pending") {
        setPaying(appointment);
      }
    },
    onUndone: (appointment) => {
      setPaying((current) => (current?.id === appointment.id ? null : current));
    },
    updateAppointmentStatus,
  });
  const todayAppointments = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            isToday(appointment.scheduledAt) && appointment.status !== "Cancelado",
        )
        .sort(
          (left, right) =>
            new Date(left.scheduledAt).getTime() -
            new Date(right.scheduledAt).getTime(),
        ),
    [appointments],
  );

  async function handlePaymentSubmit(input: AppointmentPaymentInput) {
    if (!paying) {
      return;
    }

    setSavingPayment(true);
    setPaymentError("");

    try {
      await updateAppointmentPayment(paying.id, input);
      setPaying(null);
    } catch (error) {
      setPaymentError(
        getFriendlyErrorMessage(error, "No pudimos guardar el cobro."),
      );
    } finally {
      setSavingPayment(false);
    }
  }

  const error = attendance.error || paymentError || appointmentsError;

  return (
    <Card variant="default" padding="md">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-ink">Hoy</h2>
          <p className="mt-1 text-sm text-slate-500">
            {!loaded
              ? "Cargando turnos..."
              : todayAppointments.length === 0
                ? "Sin turnos para hoy."
                : `${todayAppointments.length} ${
                    todayAppointments.length === 1 ? "turno" : "turnos"
                  }`}
          </p>
        </div>
        <Link
          className="text-sm font-semibold text-ocean-700"
          href="/dashboard/turnos?vista=dia"
          prefetch={false}
        >
          Ver agenda
        </Link>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="mt-6 flex justify-center text-ocean-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="mt-4 divide-y divide-ocean-100">
          {todayAppointments.map((appointment) => {
            const status = getAppointmentDisplayStatus(appointment);
            const future = isFutureAppointment(appointment);
            const busy = attendance.updatingId === appointment.id;
            const clinicAppointment = isProfessionalClinicAppointment(appointment);
            const attended = status === "Asistió";
            const showAttendanceActions =
              !future && status !== "Asistió" && status !== "No asistió";

            return (
              <div
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                key={appointment.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <p className="w-12 shrink-0 pt-0.5 text-sm font-bold text-ocean-800">
                    {appointment.time}
                  </p>
                  <div className="min-w-0">
                    {clinicAppointment ? (
                      <p className="truncate font-semibold text-ink">
                        {appointment.patient}
                      </p>
                    ) : (
                      <Link
                        className="block truncate font-semibold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
                        href={`/dashboard/pacientes/${appointment.patientId}`}
                        prefetch={false}
                      >
                        {appointment.patient}
                      </Link>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {appointment.origin === "clinic" ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                          style={{ backgroundColor: appointment.originColor }}
                        >
                          {appointment.originLabel}
                        </span>
                      ) : null}
                      {/* Un turno futuro no tiene nada pendiente todavía. */}
                      {future ? null : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            appointmentStatusStyles[status] ??
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {status}
                        </span>
                      )}
                      {attended && !clinicAppointment ? (
                        canCharge(appointment) ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              appointment.paymentStatus === "pending"
                                ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                                : paymentStatusStyles[appointment.paymentStatusLabel] ??
                                  "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {appointment.paymentStatus === "pending"
                              ? `Sin cobrar · ${formatCurrency(appointment.amount)}`
                              : appointment.paymentStatusLabel}
                          </span>
                        ) : (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                            {getCoverageLabel(appointment)}
                          </span>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {showAttendanceActions ? (
                    <>
                      <button
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                        disabled={busy}
                        onClick={() =>
                          void attendance.markAttendance(appointment, "attended")
                        }
                        type="button"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Asistió
                      </button>
                      <button
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                        disabled={busy}
                        onClick={() =>
                          void attendance.markAttendance(appointment, "no_show")
                        }
                        type="button"
                      >
                        <XCircle className="h-4 w-4" />
                        No asistió
                      </button>
                    </>
                  ) : null}
                  {attended &&
                  canCharge(appointment) &&
                  appointment.paymentStatus === "pending" ? (
                    <button
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-200 px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60"
                      disabled={Boolean(readOnlyMessage)}
                      onClick={() => setPaying(appointment)}
                      title={readOnlyMessage ?? undefined}
                      type="button"
                    >
                      <Wallet className="h-4 w-4" />
                      Cobrar
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {paying ? (
        <AppointmentPaymentModal
          appointment={paying}
          key={paying.id}
          onCancel={() => setPaying(null)}
          onSubmit={handlePaymentSubmit}
          saving={savingPayment}
        />
      ) : null}

      {attendance.lastChange ? (
        <UndoToast
          message={attendance.lastChange.message}
          onClose={attendance.dismissChange}
          onUndo={
            attendance.lastChange.previousStatus
              ? attendance.undoLastChange
              : undefined
          }
        />
      ) : null}
    </Card>
  );
}
