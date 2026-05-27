"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarPlus,
  Clock,
  Mail,
  Phone,
  Save,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useAppointments } from "@/hooks/useAppointments";
import { useEvolutions, type NewEvolutionInput } from "@/hooks/useEvolutions";
import { usePatients } from "@/hooks/usePatients";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
} from "@/lib/appointment-ui";
import { formatCurrency, paymentStatusStyles } from "@/lib/payment-ui";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const today = new Date().toISOString().slice(0, 10);

function createEmptyEvolution(patientId: string): NewEvolutionInput {
  return {
    patientId,
    appointmentId: "",
    sessionDate: today,
    painLevel: 0,
    mobilityNotes: "",
    clinicalNotes: "",
    nextGoals: "",
  };
}

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { authError, displayName, loading, redirecting } = useRequireAuth();
  const { appointments, error: appointmentsError, loaded: appointmentsLoaded } =
    useAppointments(patientId);
  const {
    addEvolution,
    error: evolutionsError,
    evolutions,
    loaded: evolutionsLoaded,
  } = useEvolutions(patientId);
  const { error: patientsError, loaded: patientsLoaded, patients } = usePatients();
  const [evolution, setEvolution] = useState<NewEvolutionInput>(() =>
    createEmptyEvolution(patientId),
  );
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const patient = useMemo(
    () => patients.find((item) => item.id === patientId),
    [patientId, patients],
  );
  const attendedAppointments = appointments.filter(
    (appointment) => getAppointmentDisplayStatus(appointment) === "Asistió",
  );
  const totalPaid = appointments
    .filter((appointment) => appointment.paymentStatus === "paid")
    .reduce((total, appointment) => total + appointment.amount, 0);
  const totalPending = appointments
    .filter((appointment) => appointment.paymentStatus === "pending")
    .reduce((total, appointment) => total + appointment.amount, 0);
  const lastPaidAppointment = [...appointments]
    .filter((appointment) => appointment.paymentStatus === "paid")
    .sort(
      (left, right) =>
        new Date(right.paidAt ?? right.scheduledAt).getTime() -
        new Date(left.paidAt ?? left.scheduledAt).getTime(),
    )[0];
  const evolutionByAppointment = new Map(
    evolutions
      .filter((item) => item.appointmentId)
      .map((item) => [item.appointmentId, item]),
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

  if (loading || !patientsLoaded || !appointmentsLoaded || !evolutionsLoaded) {
    return <DashboardLoading />;
  }

  function updateField<Field extends keyof NewEvolutionInput>(
    field: Field,
    value: NewEvolutionInput[Field],
  ) {
    setEvolution((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");

    try {
      await addEvolution({ ...evolution, patientId });
      setEvolution(createEmptyEvolution(patientId));
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos guardar la evolución.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ocean-700"
            href="/dashboard/pacientes"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a pacientes
          </Link>

          {patient ? (
            <>
              <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <p className="text-sm font-semibold text-ocean-700">
                      Historial del paciente
                    </p>
                    <h1 className="mt-1 text-3xl font-bold text-ink">
                      {patient.name}
                    </h1>
                    <p className="mt-2 text-slate-600">
                      DNI {patient.document} · {patient.condition}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                      patient.status === "Activo"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {patient.status}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-ocean-600" />
                    {patient.phone}
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-ocean-600" />
                    {patient.email}
                  </p>
                  <p className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-ocean-600" />
                    Profesional: {displayName}
                  </p>
                </div>
              </header>

              {(patientsError || appointmentsError || evolutionsError || actionError) ? (
                <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {actionError || patientsError || appointmentsError || evolutionsError}
                </p>
              ) : null}

              <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <form
                  className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
                  onSubmit={handleSubmit}
                >
                  <h2 className="text-lg font-bold text-ink">
                    Agregar evolución
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Esta evolución queda asociada a {patient.name}.
                  </p>

                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <label className="block md:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Turno asociado
                      </span>
                      <select
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          updateField("appointmentId", event.target.value)
                        }
                        value={evolution.appointmentId}
                      >
                        <option value="">Sin turno asociado</option>
                        {attendedAppointments.map((appointment) => (
                          <option key={appointment.id} value={appointment.id}>
                            {appointment.date} · {appointment.time} ·{" "}
                            {appointment.reason}
                          </option>
                        ))}
                      </select>
                      {attendedAppointments.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-500">
                          Para asociarla a una sesión, marcá antes un turno como
                          asistido.
                        </p>
                      ) : null}
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        Fecha
                      </span>
                      <input
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          updateField("sessionDate", event.target.value)
                        }
                        required
                        type="date"
                        value={evolution.sessionDate}
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        Dolor
                      </span>
                      <select
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          updateField("painLevel", Number(event.target.value))
                        }
                        value={evolution.painLevel}
                      >
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                          <option key={value} value={value}>
                            {value}/10
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="mt-5 block">
                    <span className="text-sm font-semibold text-slate-700">
                      Movilidad / fuerza
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateField("mobilityNotes", event.target.value)
                      }
                      placeholder="Ej. Mejora de rango en flexión"
                      required
                      type="text"
                      value={evolution.mobilityNotes}
                    />
                  </label>
                  <label className="mt-5 block">
                    <span className="text-sm font-semibold text-slate-700">
                      Notas clínicas
                    </span>
                    <textarea
                      className="mt-2 min-h-32 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateField("clinicalNotes", event.target.value)
                      }
                      placeholder="Resumen de la sesión y respuesta al tratamiento"
                      required
                      value={evolution.clinicalNotes}
                    />
                  </label>
                  <label className="mt-5 block">
                    <span className="text-sm font-semibold text-slate-700">
                      Próximos objetivos
                    </span>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateField("nextGoals", event.target.value)
                      }
                      placeholder="Objetivos o indicaciones para la próxima sesión"
                      value={evolution.nextGoals}
                    />
                  </label>

                  <button
                    className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={patient.status !== "Activo" || saving}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Guardando..." : "Guardar evolución"}
                  </button>
                </form>

                <div className="space-y-6">
                  <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-bold text-ink">
                      Resumen económico
                    </h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-emerald-50 p-4">
                        <p className="text-sm font-semibold text-emerald-700">
                          Total cobrado
                        </p>
                        <p className="mt-2 text-2xl font-bold text-ink">
                          {formatCurrency(totalPaid)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-amber-50 p-4">
                        <p className="text-sm font-semibold text-amber-700">
                          Total pendiente
                        </p>
                        <p className="mt-2 text-2xl font-bold text-ink">
                          {formatCurrency(totalPending)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-ocean-50 p-4">
                        <p className="text-sm font-semibold text-ocean-700">
                          Última sesión cobrada
                        </p>
                        <p className="mt-2 text-sm font-bold text-ink">
                          {lastPaidAppointment
                            ? `${lastPaidAppointment.date} · ${formatCurrency(
                                lastPaidAppointment.amount,
                              )}`
                            : "Sin cobros"}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-bold text-ink">
                        Turnos del paciente
                      </h2>
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                        href={`/dashboard/turnos/nuevo?paciente=${patient.id}`}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Nuevo turno
                      </Link>
                    </div>
                    <div className="mt-5 space-y-3">
                      {appointments.map((appointment) => {
                        const linkedEvolution = evolutionByAppointment.get(
                          appointment.id,
                        );

                        return (
                        <article
                          className="rounded-lg border border-ocean-100 p-4"
                          key={appointment.id}
                        >
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                              <p className="font-semibold text-ink">
                                {appointment.reason}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {appointment.date} · {appointment.time}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span
                                className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                                  appointmentStatusStyles[
                                    getAppointmentDisplayStatus(appointment)
                                  ] ?? "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {getAppointmentDisplayStatus(appointment)}
                              </span>
                              <span
                                className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                                  paymentStatusStyles[
                                    appointment.paymentStatusLabel
                                  ] ?? "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {appointment.paymentStatusLabel}
                              </span>
                            </div>
                          </div>
                          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
                            <Clock className="h-4 w-4 text-ocean-600" />
                            {appointment.duration} · {appointment.modality}
                          </p>
                          <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                            <p>
                              Monto:{" "}
                              <span className="font-semibold text-ink">
                                {formatCurrency(appointment.amount)}
                              </span>
                            </p>
                            <p>
                              Evolución:{" "}
                              <span className="font-semibold text-ink">
                                {linkedEvolution
                                  ? linkedEvolution.date
                                  : "Sin evolución asociada"}
                              </span>
                            </p>
                          </div>
                        </article>
                        );
                      })}
                    </div>
                    {appointments.length === 0 ? (
                      <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                        <p className="font-semibold text-ink">
                          Este paciente todavía no tiene turnos.
                        </p>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-bold text-ink">
                      Evoluciones / sesiones
                    </h2>
                    <div className="mt-5 space-y-3">
                      {evolutions.map((item) => (
                        <article
                          className="rounded-lg border border-ocean-100 p-4"
                          key={item.id}
                        >
                          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                            <div>
                              <p className="font-semibold text-ink">
                                {item.date}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                Profesional: {displayName}
                              </p>
                            </div>
                            <span className="flex w-fit items-center gap-2 rounded-full bg-ocean-50 px-3 py-1 text-sm font-semibold text-ocean-800">
                              <Activity className="h-4 w-4" />
                              Dolor {item.pain}
                            </span>
                          </div>
                          <p className="mt-4 text-sm font-semibold text-ocean-800">
                            {item.mobility}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">
                            {item.notes}
                          </p>
                        </article>
                      ))}
                    </div>
                    {evolutions.length === 0 ? (
                      <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                        <p className="font-semibold text-ink">
                          Este paciente todavía no tiene evoluciones.
                        </p>
                      </div>
                    ) : null}
                  </section>
                </div>
              </section>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-ocean-200 bg-white p-8 text-center">
              <p className="font-semibold text-ink">Paciente no encontrado.</p>
              <p className="mt-2 text-sm text-slate-600">
                Puede que no exista o que no pertenezca a tu usuario.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
