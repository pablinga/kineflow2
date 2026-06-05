"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarPlus,
  Clock,
  Edit3,
  Mail,
  Phone,
  Plus,
  Save,
  X,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { type Appointment, useAppointments } from "@/hooks/useAppointments";
import { useEvolutions, type NewEvolutionInput } from "@/hooks/useEvolutions";
import { usePatients } from "@/hooks/usePatients";
import {
  useTreatments,
  type NewTreatmentInput,
  type TreatmentStatus,
} from "@/hooks/useTreatments";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
} from "@/lib/appointment-ui";
import { formatCurrency, paymentStatusStyles } from "@/lib/payment-ui";
import { formatSessionAmount } from "@/lib/format";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";

const today = new Date().toISOString().slice(0, 10);

function createEmptyEvolution(patientId: string): NewEvolutionInput {
  return {
    patientId,
    treatmentId: "",
    appointmentId: "",
    sessionDate: today,
    painLevel: 0,
    mobilityNotes: "",
    clinicalNotes: "",
    nextGoals: "",
  };
}

function createEmptyTreatment(patientId: string): NewTreatmentInput {
  return {
    bodyRegion: "",
    diagnosis: "",
    notes: "",
    patientId,
    startedAt: today,
    totalSessions: 10,
  };
}

const treatmentStatusStyles: Record<TreatmentStatus, string> = {
  ABANDONADO: "bg-slate-100 text-slate-700",
  EN_CURSO: "bg-emerald-50 text-emerald-700",
  FINALIZADO: "bg-sky-50 text-sky-700",
  PAUSADO: "bg-amber-50 text-amber-700",
};

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const patientId = params.id;
  const { authError, displayName, loading, redirecting } = useRequireAuth();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const {
    appointments,
    error: appointmentsError,
    loaded: appointmentsLoaded,
    rescheduleAppointment,
    updateAppointmentStatus,
  } = useAppointments(patientId);
  const {
    addEvolution,
    error: evolutionsError,
    evolutions,
    loaded: evolutionsLoaded,
  } = useEvolutions(patientId);
  const {
    addTreatment,
    error: treatmentsError,
    loaded: treatmentsLoaded,
    refreshTreatments,
    treatments,
    updateTreatmentStatus,
  } = useTreatments(patientId);
  const {
    activePatients,
    error: patientsError,
    loaded: patientsLoaded,
    patients,
  } = usePatients();
  const [evolution, setEvolution] = useState<NewEvolutionInput>(() =>
    createEmptyEvolution(patientId),
  );
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [evolutionModalOpen, setEvolutionModalOpen] = useState(false);
  const [expandedTreatmentId, setExpandedTreatmentId] = useState("");
  const [treatment, setTreatment] = useState<NewTreatmentInput>(() =>
    createEmptyTreatment(patientId),
  );
  const [treatmentModalOpen, setTreatmentModalOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState("");
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [canceling, setCanceling] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

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

  useEffect(() => {
    const appointmentId = searchParams.get("appointment");

    if (!appointmentId || appointments.length === 0) {
      return;
    }

    const appointment = appointments.find((item) => item.id === appointmentId);

    if (appointment) {
      setEvolution((current) => ({
        ...current,
        appointmentId: appointment.id,
        treatmentId: appointment.treatmentId ?? "",
        sessionDate: appointment.scheduledAt.slice(0, 10),
      }));
      setEvolutionModalOpen(true);
    }
  }, [appointments, searchParams]);

  if (authError) {
    return (
      <DashboardLoading
        error={authError}
        retryHref={`/dashboard/pacientes/${patientId}`}
      />
    );
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesión activá. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (patientsError || appointmentsError || evolutionsError || treatmentsError) {
    return (
      <DashboardLoading
        error={patientsError || appointmentsError || evolutionsError || treatmentsError}
        retryHref={`/dashboard/pacientes/${patientId}`}
        title="No pudimos cargar la ficha"
      />
    );
  }

  if (
    loading ||
    !patientsLoaded ||
    !appointmentsLoaded ||
    !evolutionsLoaded ||
    !treatmentsLoaded ||
    !planLoaded
  ) {
    return <DashboardLoading />;
  }

  const patientLimitBlock = getPatientPlanLimitBlock({
    activePatientCount: activePatients.length,
    patientLimit: plan.limitePacientes,
  });
  const activeTreatment =
    treatments.find((item) => item.id === expandedTreatmentId) ??
    treatments.find((item) => item.status === "EN_CURSO") ??
    treatments[0] ??
    null;
  const activeTreatmentForEvolution =
    treatments.find(
      (item) => item.id === evolution.treatmentId && item.status === "EN_CURSO",
    ) ??
    treatments.find((item) => item.status === "EN_CURSO") ??
    null;
  const evolutionAppointmentOptions = activeTreatmentForEvolution
    ? attendedAppointments.filter(
        (appointment) => appointment.treatmentId === activeTreatmentForEvolution.id,
      )
    : attendedAppointments;

  function updateField<Field extends keyof NewEvolutionInput>(
    field: Field,
    value: NewEvolutionInput[Field],
  ) {
    setEvolution((current) => ({ ...current, [field]: value }));
  }

  function updateTreatmentField<Field extends keyof NewTreatmentInput>(
    field: Field,
    value: NewTreatmentInput[Field],
  ) {
    setTreatment((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");

    try {
      if (patientLimitBlock) {
        setActionError(patientLimitBlock);
        return;
      }

      await addEvolution({ ...evolution, patientId });
      setEvolution(createEmptyEvolution(patientId));
      setEvolutionModalOpen(false);
    } catch (submitError) {
      setActionError(
        getFriendlyErrorMessage(
          submitError,
          "No pudimos guardar la evolución.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAttended(appointmentId: string) {
    setActionError("");

    try {
      const result = await updateAppointmentStatus(appointmentId, "attended");
      await refreshTreatments();
      if (result.treatmentCompleted) {
        setActionError(
          `Â¡Tratamiento completado! El paciente finalizÃ³ sus ${result.treatmentCompleted.totalSessions} sesiones.`,
        );
      }
      setEvolution((current) => ({ ...current, appointmentId }));
    } catch (statusError) {
      setActionError(
        getFriendlyErrorMessage(
          statusError,
          "No pudimos marcar el turno como asistido.",
        ),
      );
    }
  }

  function prepareEvolutionForAppointment(appointmentId: string) {
    if (patientLimitBlock) {
      setActionError(patientLimitBlock);
      return;
    }

    const appointment = appointments.find((item) => item.id === appointmentId);

    setEvolution((current) => ({
      ...current,
      appointmentId,
      treatmentId: appointment?.treatmentId ?? activeTreatment?.id ?? "",
      sessionDate: appointment?.scheduledAt.slice(0, 10) ?? current.sessionDate,
    }));
    setEvolutionModalOpen(true);
  }

  async function handleTreatmentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");

    try {
      await addTreatment({ ...treatment, patientId });
      setTreatment(createEmptyTreatment(patientId));
      setTreatmentModalOpen(false);
    } catch (treatmentError) {
      setActionError(
        getFriendlyErrorMessage(
          treatmentError,
          "No pudimos guardar el tratamiento.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTreatmentStatus(id: string, status: TreatmentStatus) {
    setActionError("");

    try {
      await updateTreatmentStatus(id, status);
    } catch (statusError) {
      setActionError(
        getFriendlyErrorMessage(
          statusError,
          "No pudimos actualizar el tratamiento.",
        ),
      );
    }
  }

  function openNewEvolutionModal() {
    if (patientLimitBlock) {
      setActionError(patientLimitBlock);
      return;
    }

    setActionError("");
    setEvolution(createEmptyEvolution(patientId));
    setEvolution((current) => ({
      ...current,
      treatmentId: activeTreatment?.id ?? "",
    }));
    setEvolutionModalOpen(true);
  }

  function openReschedule(appointment: Appointment) {
    const scheduledAt = new Date(appointment.scheduledAt);

    setActionError("");
    setRescheduling(appointment);
    setRescheduleDate(appointment.scheduledAt.slice(0, 10));
    setRescheduleTime(
      scheduledAt.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    );
  }

  async function handleRescheduleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!rescheduling) {
      return;
    }

    setActionError("");
    setUpdatingId(rescheduling.id);

    try {
      await rescheduleAppointment(
        rescheduling.id,
        rescheduleDate,
        rescheduleTime,
      );
      setRescheduling(null);
    } catch (rescheduleError) {
      setActionError(
        getFriendlyErrorMessage(
          rescheduleError,
          "No pudimos reprogramar el turno.",
        ),
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function handleCancelAppointment() {
    if (!canceling) {
      return;
    }

    setActionError("");
    setUpdatingId(canceling.id);

    try {
      await updateAppointmentStatus(canceling.id, "cancelled");
      setCanceling(null);
    } catch (cancelError) {
      setActionError(
        getFriendlyErrorMessage(cancelError, "No pudimos cancelar el turno."),
      );
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
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
              <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
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
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                        patient.status === "Activo"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {patient.status}
                    </span>
                    <Link
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                      href="/dashboard/pacientes"
                    >
                      <Edit3 className="h-4 w-4" />
                      Editar paciente
                    </Link>
                    <button
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700"
                      onClick={() => setTreatmentModalOpen(true)}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Nuevo tratamiento
                    </button>
                    {patientLimitBlock ? (
                      <button
                        className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-400"
                        disabled
                        title={patientLimitBlock}
                        type="button"
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Nuevo turno
                      </button>
                    ) : (
                      <Link
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                        href={`/dashboard/turnos/nuevo?paciente=${patient.id}`}
                      >
                        <CalendarPlus className="h-4 w-4" />
                        Nuevo turno
                      </Link>
                    )}
                  </div>
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

              {patientLimitBlock ? (
                <section className="mt-6 rounded-lg border border-amber-100 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
                  <p>{patientLimitBlock}</p>
                  <Link
                    className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                    href="/dashboard/planes"
                  >
                    Reactivar plan
                  </Link>
                </section>
              ) : null}

              <section className="mt-6 grid gap-6 xl:grid-cols-[0.75fr_1.35fr]">
                <aside className="space-y-4">
                  <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-bold text-ink">
                      Resumen economico
                    </h2>
                    <div className="mt-4 grid gap-3">
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
                          Ultima sesion cobrada
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

                  <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-bold text-ink">
                        Tratamientos
                      </h2>
                      <button
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                        onClick={() => setTreatmentModalOpen(true)}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        Nuevo tratamiento
                      </button>
                    </div>
                    <div className="mt-5 space-y-4">
                      {treatments.map((item) => {
                        const treatmentAppointments = appointments.filter(
                          (appointment) => appointment.treatmentId === item.id,
                        );
                        const progress =
                          item.totalSessions > 0
                            ? Math.min(100, (item.usedSessions / item.totalSessions) * 100)
                            : 0;
                        const expanded = expandedTreatmentId === item.id;

                        return (
                          <article
                            className="rounded-lg border border-ocean-100 p-4"
                            key={item.id}
                          >
                            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                              <div>
                                <p className="font-bold text-ink">{item.diagnosis}</p>
                                <p className="mt-1 text-sm text-slate-500">
                                  {item.bodyRegion || "Sin regiÃ³n"} Â· Inicio {item.startedAt}
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full px-3 py-1 text-sm font-semibold ${treatmentStatusStyles[item.status]}`}
                                >
                                  {item.status}
                                </span>
                                <details className="relative">
                                  <summary className="inline-flex min-h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 text-slate-600">
                                    ...
                                  </summary>
                                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-ocean-100 bg-white p-2 shadow-soft">
                                    <button className="flex w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-ocean-800 hover:bg-ocean-50" type="button">
                                      Editar
                                    </button>
                                    <button className="flex w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50" onClick={() => handleTreatmentStatus(item.id, "PAUSADO")} type="button">
                                      Pausar
                                    </button>
                                    <button className="flex w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50" onClick={() => handleTreatmentStatus(item.id, "FINALIZADO")} type="button">
                                      Finalizar
                                    </button>
                                    <button className="flex w-full rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => handleTreatmentStatus(item.id, "ABANDONADO")} type="button">
                                      Marcar como abandonado
                                    </button>
                                  </div>
                                </details>
                              </div>
                            </div>
                            <div className="mt-4">
                              <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                                <span>
                                  {item.usedSessions} / {item.totalSessions} sesiones
                                </span>
                                <button
                                  className="text-ocean-700 underline-offset-4 hover:underline"
                                  onClick={() =>
                                    setExpandedTreatmentId(expanded ? "" : item.id)
                                  }
                                  type="button"
                                >
                                  Ver sesiones
                                </button>
                              </div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ocean-50">
                                <div
                                  className="h-full rounded-full bg-ocean-600"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                            </div>
                            {expanded ? (
                              <div className="mt-4 space-y-2">
                                {treatmentAppointments.length === 0 ? (
                                  <p className="rounded-lg border border-dashed border-ocean-100 p-3 text-sm text-slate-500">
                                    Sin sesiones asociadas.
                                  </p>
                                ) : (
                                  treatmentAppointments.map((appointment) => {
                                    const linkedEvolution = evolutionByAppointment.get(appointment.id);

                                    return (
                                      <div
                                        className="grid gap-2 rounded-lg bg-ocean-50 p-3 text-sm md:grid-cols-[4rem_1fr_1fr_1fr]"
                                        key={appointment.id}
                                      >
                                        <p className="font-bold text-ocean-800">
                                          #{appointment.sessionNumber ?? "-"}
                                        </p>
                                        <p>{appointment.date} Â· {appointment.time}</p>
                                        <p>{getAppointmentDisplayStatus(appointment)} Â· {appointment.paymentStatusLabel} Â· {formatSessionAmount(appointment.amount)}</p>
                                        <p className="text-ocean-700">
                                          {linkedEvolution ? `EvoluciÃ³n ${linkedEvolution.date}` : "Sin evoluciÃ³n"}
                                        </p>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                      {treatments.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                          <p className="font-semibold text-ink">
                            Este paciente todavÃ­a no tiene tratamientos.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="hidden">
                    <h2 className="text-lg font-bold text-ink">
                      Resumen econÃ³mico
                    </h2>
                    <div className="mt-4 grid gap-3">
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
                          Ãšltima sesiÃ³n cobrada
                        </p>
                        <p className="mt-2 text-sm font-bold text-ink">
                          {lastPaidAppointment
                            ? `${lastPaidAppointment.date} Â· ${formatCurrency(
                                lastPaidAppointment.amount,
                              )}`
                            : "Sin cobros"}
                        </p>
                      </div>
                    </div>
                  </section>
                </aside>
                <form
                  className="hidden"
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
                          Para asociar esta evolución a una sesión, primero
                          marca un turno como asistido o crea una nueva sesión.
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
                    disabled={
                      patient.status !== "Activo" ||
                      saving ||
                      Boolean(patientLimitBlock)
                    }
                    title={patientLimitBlock ?? undefined}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Guardando..." : "Guardar evolución"}
                  </button>
                </form>

                <div className="space-y-6">
                  <section className="hidden">
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

                  <section className="hidden">
                    <div className="flex items-center justify-between gap-4">
                      <h2 className="text-lg font-bold text-ink">
                        Turnos
                      </h2>
                      {patientLimitBlock ? (
                        <button
                          className="inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-400"
                          disabled
                          title={patientLimitBlock}
                          type="button"
                        >
                          <CalendarPlus className="h-4 w-4" />
                          + Nuevo turno
                        </button>
                      ) : (
                        <Link
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                          href={`/dashboard/turnos/nuevo?paciente=${patient.id}`}
                        >
                          <CalendarPlus className="h-4 w-4" />
                          + Nuevo turno
                        </Link>
                      )}
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
                                {formatSessionAmount(appointment.amount)}
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
                          <div className="mt-4 flex flex-wrap gap-2">
                            {getAppointmentDisplayStatus(appointment) !==
                            "Asistió" ? (
                              <button
                                className="inline-flex min-h-9 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                                onClick={() =>
                                  handleMarkAttended(appointment.id)
                                }
                                type="button"
                              >
                                Marcar asistió
                              </button>
                            ) : null}
                            <button
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
                              disabled={Boolean(patientLimitBlock)}
                              onClick={() =>
                                prepareEvolutionForAppointment(appointment.id)
                              }
                              title={patientLimitBlock ?? undefined}
                              type="button"
                            >
                              Registrar evolución
                            </button>
                            <Link
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                              href="/dashboard/turnos"
                            >
                              Editar cobro
                            </Link>
                            <button
                              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              onClick={() => openReschedule(appointment)}
                              type="button"
                            >
                              Reprogramar
                            </button>
                            {getAppointmentDisplayStatus(appointment) !==
                            "Cancelado" ? (
                              <button
                                className="inline-flex min-h-9 items-center justify-center rounded-lg border border-red-100 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                onClick={() => setCanceling(appointment)}
                                type="button"
                              >
                                Cancelar
                              </button>
                            ) : null}
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

                  <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                    <h2 className="text-lg font-bold text-ink">
                      Evoluciones / sesiónes
                    </h2>
                    <button
                      className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      disabled={Boolean(patientLimitBlock)}
                      onClick={openNewEvolutionModal}
                      title={patientLimitBlock ?? undefined}
                      type="button"
                    >
                      <Plus className="h-4 w-4" />
                      Nueva evoluciÃ³n
                    </button>
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
                          <details className="mt-2 text-sm leading-6 text-slate-600">
                            <summary className="cursor-pointer font-semibold text-ocean-800">
                              Ver notas clÃ­nicas
                            </summary>
                            <p className="mt-2">{item.notes}</p>
                          </details>
                        </article>
                      ))}
                    </div>
                    {evolutions.length === 0 ? (
                      <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                        <p className="font-semibold text-ink">
                          Este paciente todavía no tiene evoluciónes.
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

          {treatmentModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 py-6">
              <form
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
                onSubmit={handleTreatmentSubmit}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink">
                      Nuevo tratamiento
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Asociado a {patient?.name ?? "este paciente"}.
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                    onClick={() => setTreatmentModalOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Diagnostico
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateTreatmentField("diagnosis", event.target.value)
                      }
                      required
                      type="text"
                      value={treatment.diagnosis}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Region del cuerpo
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateTreatmentField("bodyRegion", event.target.value)
                      }
                      placeholder="Columna lumbar, rodilla derecha"
                      type="text"
                      value={treatment.bodyRegion}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Total de sesiones
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      min={1}
                      onChange={(event) =>
                        updateTreatmentField(
                          "totalSessions",
                          Number(event.target.value),
                        )
                      }
                      required
                      type="number"
                      value={treatment.totalSessions}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Fecha de inicio
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateTreatmentField("startedAt", event.target.value)
                      }
                      required
                      type="date"
                      value={treatment.startedAt}
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Notas
                    </span>
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        updateTreatmentField("notes", event.target.value)
                      }
                      value={treatment.notes}
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() => setTreatmentModalOpen(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                    disabled={saving}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Guardando..." : "Guardar tratamiento"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {evolutionModalOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 py-6">
              <form
                className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
                onSubmit={handleSubmit}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink">
                      Nueva evoluciÃ³n
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Asociada a {patient?.name ?? "este paciente"}.
                    </p>
                  </div>
                  <button
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                    onClick={() => setEvolutionModalOpen(false)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 grid gap-5 md:grid-cols-2">
                  <label className="block md:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Turno asociado
                    </span>
                    <select
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) => {
                        const selectedAppointment = attendedAppointments.find(
                          (appointment) => appointment.id === event.target.value,
                        );

                        updateField("appointmentId", event.target.value);
                        updateField(
                          "treatmentId",
                          selectedAppointment?.treatmentId ??
                            activeTreatmentForEvolution?.id ??
                            "",
                        );
                      }}
                      value={evolution.appointmentId}
                    >
                      <option value="">Sin turno asociado</option>
                      {evolutionAppointmentOptions.map((appointment) => (
                        <option key={appointment.id} value={appointment.id}>
                          {appointment.date} Â· {appointment.time} Â·{" "}
                          {appointment.reason}
                        </option>
                      ))}
                    </select>
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
                      Nivel de dolor
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
                    type="text"
                    value={evolution.mobilityNotes}
                  />
                </label>
                <label className="mt-5 block">
                  <span className="text-sm font-semibold text-slate-700">
                    Notas clÃ­nicas
                  </span>
                  <textarea
                    className="mt-2 min-h-32 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      updateField("clinicalNotes", event.target.value)
                    }
                    required
                    value={evolution.clinicalNotes}
                  />
                </label>
                <label className="mt-5 block">
                  <span className="text-sm font-semibold text-slate-700">
                    PrÃ³ximos objetivos
                  </span>
                  <textarea
                    className="mt-2 min-h-24 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => updateField("nextGoals", event.target.value)}
                    value={evolution.nextGoals}
                  />
                </label>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() => setEvolutionModalOpen(false)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                    disabled={saving}
                    type="submit"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? "Guardando..." : "Guardar evoluciÃ³n"}
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {rescheduling ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 py-6">
              <form
                className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
                onSubmit={handleRescheduleSubmit}
              >
                <h2 className="text-lg font-bold text-ink">
                  Reprogramar turno
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {rescheduling.reason} · {rescheduling.date} ·{" "}
                  {rescheduling.time}
                </p>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Fecha
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) => setRescheduleDate(event.target.value)}
                      required
                      type="date"
                      value={rescheduleDate}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Hora
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) => setRescheduleTime(event.target.value)}
                      required
                      type="time"
                      value={rescheduleTime}
                    />
                  </label>
                </div>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() => setRescheduling(null)}
                    type="button"
                  >
                    Volver
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                    disabled={updatingId === rescheduling.id}
                    type="submit"
                  >
                    Guardar nueva fecha
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {canceling ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 py-6">
              <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-5 shadow-soft">
                <h2 className="text-lg font-bold text-ink">Cancelar turno</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  El turno de {patient?.name} del {canceling.date} a las{" "}
                  {canceling.time} dejara de aparecer como turno activo. Esta
                  accion no borra el historial.
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() => setCanceling(null)}
                    type="button"
                  >
                    Volver
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                    disabled={updatingId === canceling.id}
                    onClick={handleCancelAppointment}
                    type="button"
                  >
                    Cancelar turno
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
