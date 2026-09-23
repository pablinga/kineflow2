"use client";

import { type FormEvent, useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, Wallet, XCircle } from "lucide-react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  type Appointment,
  type AppointmentPaymentInput,
  type PaymentMethod,
  paymentMethodLabels,
} from "@/hooks/useAppointments";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
} from "@/lib/appointment-ui";
import {
  formatCurrency,
  getCoverageLabel,
  isPatientPaidAppointment,
  paymentStatusStyles,
} from "@/lib/payment-ui";

const INITIAL_VISIBLE = 10;

type PatientAppointmentHistoryProps = {
  appointments: Appointment[];
  isReadOnly: boolean;
  onMarkUnpaid: (appointment: Appointment) => Promise<void>;
  onPayment: (
    appointment: Appointment,
    input: AppointmentPaymentInput,
  ) => Promise<void>;
  onStatusChange: (
    appointment: Appointment,
    status: "attended" | "no_show",
  ) => Promise<void>;
  readOnlyMessage: string;
  showProfessional: boolean;
  /** Turno de clínica visto por el profesional: solo registra asistencia. */
  isProfessionalClinicAppointment: (appointment: Appointment) => boolean;
};

function isFuture(appointment: Appointment) {
  return new Date(appointment.scheduledAt).getTime() > Date.now();
}

export function PatientAppointmentHistory({
  appointments,
  isProfessionalClinicAppointment,
  isReadOnly,
  onMarkUnpaid,
  onPayment,
  onStatusChange,
  readOnlyMessage,
  showProfessional,
}: PatientAppointmentHistoryProps) {
  const [showAll, setShowAll] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [paying, setPaying] = useState<Appointment | null>(null);
  const [paymentForm, setPaymentForm] = useState<AppointmentPaymentInput>({
    amount: 0,
    paymentMethod: "",
    paymentNotes: "",
  });

  // Más recientes primero; los próximos turnos quedan arriba de todo.
  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort(
        (left, right) =>
          new Date(right.scheduledAt).getTime() -
          new Date(left.scheduledAt).getTime(),
      ),
    [appointments],
  );
  const visibleAppointments = showAll
    ? sortedAppointments
    : sortedAppointments.slice(0, INITIAL_VISIBLE);

  async function run(appointment: Appointment, action: () => Promise<void>) {
    setUpdatingId(appointment.id);

    try {
      await action();
    } finally {
      setUpdatingId("");
    }
  }

  function openPayment(appointment: Appointment) {
    setPaying(appointment);
    setPaymentForm({
      amount: appointment.amount,
      paymentMethod: appointment.paymentMethod,
      paymentNotes: appointment.paymentNotes,
    });
  }

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!paying) {
      return;
    }

    await run(paying, () => onPayment(paying, paymentForm));
    setPaying(null);
  }

  return (
    <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:mt-6 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">Historial de turnos</h2>
        <span className="text-sm font-semibold text-slate-500">
          {appointments.length}{" "}
          {appointments.length === 1 ? "turno" : "turnos"}
        </span>
      </div>

      {appointments.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
          <p className="font-semibold text-ink">
            Este paciente todavía no tiene turnos.
          </p>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-ocean-100 rounded-lg border border-ocean-100">
          {visibleAppointments.map((appointment) => {
            const status = getAppointmentDisplayStatus(appointment);
            const clinicAppointment = isProfessionalClinicAppointment(appointment);
            const blocked = isReadOnly && !clinicAppointment;
            const busy = updatingId === appointment.id;
            const cancelled = appointment.status === "Cancelado";
            const future = isFuture(appointment);
            const isPaid = appointment.paymentStatus === "paid";
            // Obra social / ART: no lo cobra el paciente.
            const patientPays = isPatientPaidAppointment(appointment);

            return (
              <article
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                key={appointment.id}
                style={{
                  borderLeftColor: appointment.originColor,
                  borderLeftWidth: 4,
                }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {appointment.date} · {appointment.time}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: appointment.originColor }}
                    >
                      {appointment.originLabel === "Propio"
                        ? "Particular"
                        : appointment.originLabel}
                    </span>
                    {showProfessional && appointment.professionalName ? (
                      <span className="text-xs font-semibold text-slate-500">
                        {appointment.professionalName}
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        appointmentStatusStyles[status] ??
                        "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {status}
                    </span>
                    {clinicAppointment || cancelled ? null : !patientPays ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                        {getCoverageLabel(appointment)}
                      </span>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          paymentStatusStyles[appointment.paymentStatusLabel] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {appointment.paymentStatusLabel} ·{" "}
                        {formatCurrency(appointment.amount)}
                      </span>
                    )}
                  </div>
                </div>

                {cancelled ? null : (
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy || blocked || future || status === "Asistió"}
                      onClick={() =>
                        run(appointment, () => onStatusChange(appointment, "attended"))
                      }
                      title={
                        blocked
                          ? readOnlyMessage
                          : future
                            ? "Disponible cuando llegue el horario del turno"
                            : undefined
                      }
                      type="button"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Asistió
                    </button>
                    <button
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={busy || blocked || future || status === "No asistió"}
                      onClick={() =>
                        run(appointment, () => onStatusChange(appointment, "no_show"))
                      }
                      title={
                        blocked
                          ? readOnlyMessage
                          : future
                            ? "Disponible cuando llegue el horario del turno"
                            : undefined
                      }
                      type="button"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      No asistió
                    </button>
                    {clinicAppointment || !patientPays ? null : isPaid ? (
                      <button
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={busy || blocked}
                        onClick={() => {
                          if (
                            window.confirm(
                              "¿Marcar este turno como pendiente de cobro?",
                            )
                          ) {
                            void run(appointment, () => onMarkUnpaid(appointment));
                          }
                        }}
                        title={blocked ? readOnlyMessage : undefined}
                        type="button"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Marcar pendiente
                      </button>
                    ) : (
                      <button
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={busy || blocked}
                        onClick={() => openPayment(appointment)}
                        title={blocked ? readOnlyMessage : undefined}
                        type="button"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        Cobrar
                      </button>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {sortedAppointments.length > INITIAL_VISIBLE ? (
        <button
          className="mt-3 text-sm font-semibold text-ocean-700 underline-offset-4 hover:underline"
          onClick={() => setShowAll((current) => !current)}
          type="button"
        >
          {showAll
            ? "Ver menos"
            : `Ver todos (${sortedAppointments.length})`}
        </button>
      ) : null}

      {paying ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6">
          <form
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
            onSubmit={handlePaymentSubmit}
          >
            <h2 className="text-lg font-bold text-ink">Registrar cobro</h2>
            <p className="mt-1 text-sm text-slate-600">
              {paying.date} · {paying.time}
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <FieldLabel required>Monto</FieldLabel>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  min={0}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      amount: Number(event.target.value),
                    }))
                  }
                  required
                  step="100"
                  type="number"
                  value={paymentForm.amount}
                />
              </label>
              <label className="block">
                <FieldLabel required>Medio de pago</FieldLabel>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      paymentMethod: event.target.value as PaymentMethod | "",
                    }))
                  }
                  required
                  value={paymentForm.paymentMethod}
                >
                  <option value="">Seleccionar medio</option>
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">
                Observación de pago
              </span>
              <textarea
                className="mt-2 min-h-24 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                onChange={(event) =>
                  setPaymentForm((current) => ({
                    ...current,
                    paymentNotes: event.target.value,
                  }))
                }
                value={paymentForm.paymentNotes}
              />
            </label>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                onClick={() => setPaying(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                disabled={updatingId === paying.id}
                type="submit"
              >
                Guardar cobro
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
