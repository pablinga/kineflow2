"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, WalletCards } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  paymentMethodLabels,
  paymentStatusLabels,
  type PaymentMethod,
  type PaymentStatus,
  useAppointments,
} from "@/hooks/useAppointments";
import { usePatients } from "@/hooks/usePatients";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
} from "@/lib/appointment-ui";
import { formatCurrency, paymentStatusStyles } from "@/lib/payment-ui";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function IncomePage() {
  const { authError, displayName, loading, redirecting } = useRequireAuth();
  const { appointments, error: appointmentsError, loaded: appointmentsLoaded } =
    useAppointments();
  const { activePatients, loaded: patientsLoaded } = usePatients();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "all">(
    "all",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "all">(
    "all",
  );
  const [patientId, setPatientId] = useState("all");

  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        const scheduledAt = new Date(appointment.scheduledAt).getTime();
        const from = fromDate
          ? new Date(`${fromDate}T00:00:00`).getTime()
          : null;
        const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;

        return (
          (!from || scheduledAt >= from) &&
          (!to || scheduledAt <= to) &&
          (paymentStatus === "all" ||
            appointment.paymentStatus === paymentStatus) &&
          (paymentMethod === "all" ||
            appointment.paymentMethod === paymentMethod) &&
          (patientId === "all" || appointment.patientId === patientId)
        );
      }),
    [appointments, fromDate, patientId, paymentMethod, paymentStatus, toDate],
  );

  const total = filteredAppointments.reduce(
    (sum, appointment) => sum + appointment.amount,
    0,
  );

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesión activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !appointmentsLoaded || !patientsLoaded) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Ingresos</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Control económico
              </h1>
              <p className="mt-2 text-slate-600">
                Seguimiento simple de cobros por sesión o turno.
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-700">
                Total filtrado
              </p>
              <p className="mt-1 text-2xl font-bold text-ink">
                {formatCurrency(total)}
              </p>
            </div>
          </header>

          {appointmentsError ? (
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {appointmentsError}
            </p>
          ) : null}

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Desde
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => setFromDate(event.target.value)}
                  type="date"
                  value={fromDate}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Hasta
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => setToDate(event.target.value)}
                  type="date"
                  value={toDate}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Estado de cobro
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    setPaymentStatus(event.target.value as PaymentStatus | "all")
                  }
                  value={paymentStatus}
                >
                  <option value="all">Todos</option>
                  {Object.entries(paymentStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Medio de pago
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    setPaymentMethod(event.target.value as PaymentMethod | "all")
                  }
                  value={paymentMethod}
                >
                  <option value="all">Todos</option>
                  {Object.entries(paymentMethodLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Paciente
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => setPatientId(event.target.value)}
                  value={patientId}
                >
                  <option value="all">Todos</option>
                  {activePatients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-ocean-100 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <WalletCards className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Sesiones y cobros
                </h2>
                <p className="text-sm text-slate-500">
                  {filteredAppointments.length} registros encontrados.
                </p>
              </div>
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-ocean-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Fecha</th>
                    <th className="px-5 py-3 font-semibold">Paciente</th>
                    <th className="px-5 py-3 font-semibold">Profesional</th>
                    <th className="px-5 py-3 font-semibold">Atención</th>
                    <th className="px-5 py-3 font-semibold">Turno</th>
                    <th className="px-5 py-3 font-semibold">Cobro</th>
                    <th className="px-5 py-3 font-semibold">Medio</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Monto
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-100">
                  {filteredAppointments.map((appointment) => {
                    const status = getAppointmentDisplayStatus(appointment);

                    return (
                      <tr key={appointment.id}>
                        <td className="px-5 py-4 font-semibold text-slate-600">
                          {appointment.date} · {appointment.time}
                        </td>
                        <td className="px-5 py-4">
                          <Link
                            className="font-semibold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
                            href={`/dashboard/pacientes/${appointment.patientId}`}
                          >
                            {appointment.patient}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {displayName}
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {appointment.reason || appointment.modality}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              appointmentStatusStyles[status] ??
                              "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              paymentStatusStyles[
                                appointment.paymentStatusLabel
                              ] ?? "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {appointment.paymentStatusLabel}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-slate-600">
                          {appointment.paymentMethodLabel}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-ink">
                          {formatCurrency(appointment.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-ocean-100 md:hidden">
              {filteredAppointments.map((appointment) => {
                const status = getAppointmentDisplayStatus(appointment);

                return (
                  <article className="p-5" key={appointment.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-500">
                          {appointment.date} · {appointment.time}
                        </p>
                        <Link
                          className="mt-1 block font-bold text-ink underline-offset-4 hover:text-ocean-700 hover:underline"
                          href={`/dashboard/pacientes/${appointment.patientId}`}
                        >
                          {appointment.patient}
                        </Link>
                      </div>
                      <Link
                        className="rounded-lg border border-ocean-100 p-2 text-ocean-700"
                        href={`/dashboard/pacientes/${appointment.patientId}`}
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>
                    <p className="mt-3 text-sm text-slate-600">
                      {appointment.reason || appointment.modality}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          appointmentStatusStyles[status] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {status}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          paymentStatusStyles[appointment.paymentStatusLabel] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {appointment.paymentStatusLabel}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-500">
                        {appointment.paymentMethodLabel}
                      </span>
                      <span className="font-bold text-ink">
                        {formatCurrency(appointment.amount)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            {filteredAppointments.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-semibold text-ink">
                  No hay ingresos para los filtros seleccionados.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
