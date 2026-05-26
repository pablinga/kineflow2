"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  type Appointment,
  type AppointmentStatus,
  useAppointments,
} from "@/hooks/useAppointments";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
  isUpcomingActiveAppointment,
} from "@/lib/appointment-ui";
import { useRequireAuth } from "@/hooks/useRequireAuth";

type PendingAction = {
  appointment: Appointment;
  status: AppointmentStatus;
  title: string;
  message: string;
  buttonLabel: string;
  tone: "green" | "red" | "rose";
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function compactDayLabel(date: Date) {
  const today = new Date();

  if (sameDay(date, today)) {
    return "Hoy";
  }

  if (sameDay(date, addDays(today, -1))) {
    return "Ayer";
  }

  if (sameDay(date, addDays(today, 1))) {
    return "Mañana";
  }

  return date.toLocaleDateString("es-AR", { weekday: "short" });
}

function isFutureAppointment(appointment: Appointment) {
  return new Date(appointment.scheduledAt).getTime() > Date.now();
}

function actionToneClass(tone: PendingAction["tone"]) {
  if (tone === "green") {
    return "bg-emerald-600 hover:bg-emerald-700";
  }

  if (tone === "rose") {
    return "bg-rose-600 hover:bg-rose-700";
  }

  return "bg-red-600 hover:bg-red-700";
}

export default function AppointmentsPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const {
    appointments,
    error,
    loaded,
    rescheduleAppointment,
    updateAppointmentStatus,
  } = useAppointments();
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionsAppointment, setActionsAppointment] =
    useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [mobileCenterDate, setMobileCenterDate] = useState(() => new Date());

  const upcomingAppointments = [...appointments]
    .filter(isUpcomingActiveAppointment)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, 12);
  const mobileDays = useMemo(
    () =>
      [-1, 0, 1].map((offset) => {
        const date = addDays(mobileCenterDate, offset);
        const appointmentsForDay = appointments
          .filter((appointment) =>
            sameDay(new Date(appointment.scheduledAt), date),
          )
          .sort(
            (a, b) =>
              new Date(a.scheduledAt).getTime() -
              new Date(b.scheduledAt).getTime(),
          );

        return {
          appointments: appointmentsForDay,
          date,
          isToday: sameDay(date, new Date()),
        };
      }),
    [appointments, mobileCenterDate],
  );
  const visibleAppointments = mobileDays.flatMap((day) => day.appointments);
  const visibleRangeLabel = `${mobileDays[0]?.date.toLocaleDateString(
    "es-AR",
  )} - ${mobileDays[2]?.date.toLocaleDateString("es-AR")}`;

  function askForStatusChange(
    appointment: Appointment,
    status: AppointmentStatus,
  ) {
    const actionByStatus: Record<
      "attended" | "cancelled" | "no_show",
      Omit<PendingAction, "appointment" | "status">
    > = {
      attended: {
        title: "Marcar asistencia",
        message: `Se marcará el turno de ${appointment.patient} como asistido.`,
        buttonLabel: "Marcar asistió",
        tone: "green",
      },
      cancelled: {
        title: "Cancelar turno",
        message: `El turno de ${appointment.patient} dejará de aparecer como próximo turno activo.`,
        buttonLabel: "Cancelar turno",
        tone: "red",
      },
      no_show: {
        title: "Registrar ausencia",
        message: `Se registrará que ${appointment.patient} no asistió a este turno.`,
        buttonLabel: "Marcar no asistió",
        tone: "rose",
      },
    };

    if (
      status !== "attended" &&
      status !== "cancelled" &&
      status !== "no_show"
    ) {
      return;
    }

    setPendingAction({
      appointment,
      status,
      ...actionByStatus[status],
    });
  }

  function openReschedule(appointment: Appointment) {
    const scheduledAt = new Date(appointment.scheduledAt);
    setActionsAppointment(null);
    setRescheduling(appointment);
    setRescheduleDate(scheduledAt.toISOString().slice(0, 10));
    setRescheduleTime(
      scheduledAt.toLocaleTimeString("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
    );
  }

  function openStatusModal(appointment: Appointment, status: AppointmentStatus) {
    if (
      ["attended", "no_show"].includes(status) &&
      isFutureAppointment(appointment)
    ) {
      setActionsAppointment(null);
      setActionError(
        "No se puede registrar asistencia o ausencia en un turno futuro.",
      );
      return;
    }

    setActionsAppointment(null);
    askForStatusChange(appointment, status);
  }

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

  if (loading || !loaded) {
    return <DashboardLoading />;
  }

  async function confirmStatusChange() {
    if (!pendingAction) {
      return;
    }

    setActionError("");
    setUpdatingId(pendingAction.appointment.id);

    try {
      await updateAppointmentStatus(
        pendingAction.appointment.id,
        pendingAction.status,
      );
      setPendingAction(null);
    } catch (updateError) {
      setActionError(
        updateError instanceof Error
          ? updateError.message
          : "No pudimos actualizar el turno.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  async function handleRescheduleSubmit(event: FormEvent<HTMLFormElement>) {
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
        rescheduleError instanceof Error
          ? rescheduleError.message
          : "No pudimos reprogramar el turno.",
      );
    } finally {
      setUpdatingId("");
    }
  }

  function renderActionItems(appointment: Appointment) {
    const disabled = updatingId === appointment.id;
    const futureAttendanceDisabled = isFutureAppointment(appointment);

    return (
      <>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
          disabled={disabled || futureAttendanceDisabled}
          onClick={() => openStatusModal(appointment, "attended")}
          title={
            futureAttendanceDisabled
              ? "Disponible cuando llegue el horario del turno"
              : undefined
          }
          type="button"
        >
          <CheckCircle2 className="h-4 w-4" />
          Marcar como asistió
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          disabled={disabled || futureAttendanceDisabled}
          onClick={() => openStatusModal(appointment, "no_show")}
          title={
            futureAttendanceDisabled
              ? "Disponible cuando llegue el horario del turno"
              : undefined
          }
          type="button"
        >
          <XCircle className="h-4 w-4" />
          Marcar como no asistió
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-ocean-800 hover:bg-ocean-50 disabled:opacity-60"
          disabled={disabled}
          onClick={() => openReschedule(appointment)}
          type="button"
        >
          <RotateCcw className="h-4 w-4" />
          Reprogramar
        </button>
        <button
          className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
          disabled={disabled}
          onClick={() => openStatusModal(appointment, "cancelled")}
          type="button"
        >
          <XCircle className="h-4 w-4" />
          Cancelar turno
        </button>
      </>
    );
  }

  function renderAppointment(appointment: Appointment) {
    const status = getAppointmentDisplayStatus(appointment);

    return (
      <article
        className="rounded-lg border border-ocean-100 bg-white px-2 py-2 shadow-sm"
        key={appointment.id}
      >
        <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto_auto_auto] items-center gap-1.5">
          <p className="whitespace-nowrap text-[0.72rem] font-bold text-ocean-800">
            {appointment.time}
          </p>
          <span className="text-[0.68rem] font-semibold text-slate-400">-</span>
          <Link
            className="group relative block min-w-0 truncate text-[0.72rem] font-semibold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline focus:outline-none focus:ring-2 focus:ring-ocean-200"
            href={`/dashboard/pacientes/${appointment.patientId}`}
            title={`Ver detalle de ${appointment.patient}`}
          >
            {appointment.patient}
            <span className="pointer-events-none absolute left-0 top-full z-30 mt-2 hidden w-max max-w-[13rem] rounded-lg border border-ocean-100 bg-white px-3 py-2 text-xs font-semibold text-ocean-900 shadow-soft group-hover:block group-focus:block">
              Ver detalle de {appointment.patient}
            </span>
          </Link>
          <span className="text-[0.62rem] font-semibold text-slate-400">
            -
          </span>
          <span className="whitespace-nowrap text-[0.62rem] font-semibold text-ocean-800">
            {appointment.modality}
          </span>
          <span
            className={`w-fit whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none ${
              appointmentStatusStyles[status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {status}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <button
            className="flex min-h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-ocean-200 px-2 text-[0.68rem] font-semibold text-ocean-800 transition hover:bg-ocean-50 xl:hidden"
            onClick={() => setActionsAppointment(appointment)}
            type="button"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            Acciones
          </button>

          <details className="relative hidden flex-1 xl:block">
            <summary className="flex min-h-7 cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-ocean-200 px-2 text-[0.68rem] font-semibold text-ocean-800 transition hover:bg-ocean-50">
              <MoreHorizontal className="h-3.5 w-3.5" />
              Acciones
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-ocean-100 bg-white p-2 shadow-soft">
              {renderActionItems(appointment)}
            </div>
          </details>

          {status === "Asistió" ? (
            <Link
              className="inline-flex min-h-7 flex-1 items-center justify-center rounded-lg bg-ocean-600 px-2 text-[0.68rem] font-semibold text-white transition hover:bg-ocean-700"
              href={`/dashboard/pacientes/${appointment.patientId}`}
            >
              Cargar evolución
            </Link>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Turnos</p>
              <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
                Agenda
              </h1>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Ayer, hoy y mañana · {visibleRangeLabel}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="grid grid-cols-3 rounded-lg border border-ocean-100 bg-white p-1">
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setMobileCenterDate((date) => addDays(date, -1))}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setMobileCenterDate(new Date())}
                  type="button"
                >
                  Hoy
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setMobileCenterDate((date) => addDays(date, 1))}
                  type="button"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/dashboard/turnos/nuevo"
              >
                <CalendarPlus className="h-4 w-4" />
                Nuevo turno
              </Link>
            </div>
          </header>

          {error || actionError ? (
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError || error}
            </p>
          ) : null}

          {visibleAppointments.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-white p-8 text-center shadow-sm">
              <p className="font-semibold text-ink">
                No hay turnos para estos días.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Usá Nuevo turno para programar sesiones.
              </p>
            </div>
          ) : null}

          <section className="mt-6">
            <div className="grid grid-cols-3 gap-2">
              {mobileDays.map((day) => (
                <div
                  className={`min-w-0 rounded-lg border bg-white p-2 shadow-sm ${
                    day.isToday
                      ? "border-ocean-300 ring-2 ring-ocean-100"
                      : "border-ocean-100"
                  }`}
                  key={day.date.toISOString()}
                >
                  <div
                    className={`mb-2 rounded-lg px-2 py-2 text-center ${
                      day.isToday ? "bg-ocean-600 text-white" : "bg-ocean-50"
                    }`}
                  >
                    <p
                      className={`text-[0.7rem] font-bold capitalize leading-4 ${
                        day.isToday ? "text-white" : "text-ocean-900"
                      }`}
                    >
                      {compactDayLabel(day.date)}
                    </p>
                    <p
                      className={`mt-0.5 text-[0.68rem] font-semibold ${
                        day.isToday ? "text-white/90" : "text-slate-500"
                      }`}
                    >
                      {day.date.toLocaleDateString("es-AR", {
                        weekday: "short",
                        day: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {day.appointments.map(renderAppointment)}
                    {day.appointments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-ocean-100 bg-ocean-50 p-2 text-center">
                        <p className="text-[0.68rem] font-medium text-slate-500">
                          Sin turnos
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Próximos turnos</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Vista lista para revisión rápida.
                </p>
              </div>
              <span className="rounded-full bg-ocean-50 px-3 py-1 text-sm font-semibold text-ocean-800">
                {upcomingAppointments.length}
              </span>
            </div>
            <div className="mt-5 divide-y divide-ocean-100">
              {upcomingAppointments.map((appointment) => {
                const status = getAppointmentDisplayStatus(appointment);

                return (
                  <div
                    className="grid gap-3 py-4 md:grid-cols-[7rem_5rem_1fr_auto] md:items-center"
                    key={appointment.id}
                  >
                    <p className="text-sm font-semibold text-slate-600">
                      {appointment.date}
                    </p>
                    <p className="whitespace-nowrap text-sm font-bold text-ocean-800">
                      {appointment.time}
                    </p>
                    <div>
                      <Link
                        className="font-semibold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
                        href={`/dashboard/pacientes/${appointment.patientId}`}
                      >
                        {appointment.patient}
                      </Link>
                      <p className="mt-1 text-sm text-slate-500">
                        {appointment.reason} · {appointment.modality}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                          appointmentStatusStyles[status] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {upcomingAppointments.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                <p className="font-semibold text-ink">
                  No hay próximos turnos registrados.
                </p>
              </div>
            ) : null}
          </section>

          {actionsAppointment ? (
            <div className="fixed inset-0 z-50 flex items-end bg-ink/40 px-3 pb-3 xl:hidden">
              <div className="w-full rounded-t-2xl border border-ocean-100 bg-white p-4 shadow-soft">
                <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink">
                      Acciones del turno
                    </h2>
                    <Link
                      className="mt-1 block text-sm font-semibold text-ocean-800 underline-offset-4 hover:underline"
                      href={`/dashboard/pacientes/${actionsAppointment.patientId}`}
                    >
                      {actionsAppointment.patient}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">
                      {actionsAppointment.date} · {actionsAppointment.time}
                    </p>
                  </div>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-ocean-100 text-slate-500"
                    onClick={() => setActionsAppointment(null)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-4 divide-y divide-ocean-100">
                  {renderActionItems(actionsAppointment)}
                </div>
              </div>
            </div>
          ) : null}

          {pendingAction ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6">
              <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-5 shadow-soft">
                <h2 className="text-lg font-bold text-ink">
                  {pendingAction.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pendingAction.message}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() => setPendingAction(null)}
                    type="button"
                  >
                    Volver
                  </button>
                  <button
                    className={`inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold text-white transition disabled:opacity-60 ${actionToneClass(
                      pendingAction.tone,
                    )}`}
                    disabled={updatingId === pendingAction.appointment.id}
                    onClick={confirmStatusChange}
                    type="button"
                  >
                    {pendingAction.buttonLabel}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {rescheduling ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6">
              <form
                className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
                onSubmit={handleRescheduleSubmit}
              >
                <h2 className="text-lg font-bold text-ink">Reprogramar turno</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {rescheduling.patient} · {rescheduling.reason}
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
                    Cancelar
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
        </div>
      </section>
    </main>
  );
}
