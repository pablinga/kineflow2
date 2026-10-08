"use client";

import { type FormEvent, useState } from "react";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  type Appointment,
  type AppointmentPaymentInput,
  type PaymentMethod,
  paymentMethodLabels,
} from "@/hooks/useAppointments";

type AppointmentPaymentModalProps = {
  appointment: Appointment;
  onCancel: () => void;
  onSubmit: (input: AppointmentPaymentInput) => Promise<void>;
  saving: boolean;
};

/**
 * Formulario de cobro de un turno. Lo comparten Inicio, la Agenda y el
 * historial de la ficha del paciente.
 */
export function AppointmentPaymentModal({
  appointment,
  onCancel,
  onSubmit,
  saving,
}: AppointmentPaymentModalProps) {
  const [paymentForm, setPaymentForm] = useState<AppointmentPaymentInput>({
    amount: appointment.amount,
    paymentMethod: appointment.paymentMethod,
    paymentNotes: appointment.paymentNotes,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(paymentForm);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6">
      <form
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-bold text-ink">
          {appointment.paymentStatus === "pending" ? "Registrar cobro" : "Editar cobro"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {appointment.patient} · {appointment.date} · {appointment.time}
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
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            {saving ? "Guardando..." : "Guardar cobro"}
          </button>
        </div>
      </form>
    </div>
  );
}
