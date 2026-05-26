"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MoreHorizontal,
  RotateCcw,
  UserRound,
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

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

type PendingAction = {
  appointment: Appointment;
  status: AppointmentStatus;
  title: string;
  message: string;
  buttonLabel: string;
  tone: "green" | "red" | "rose";
};

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - day + 1);
  return next;
}

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

function weekLabel(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  return `${weekStart.toLocaleDateString("es-AR")} - ${weekEnd.toLocaleDateString(
    "es-AR",
  )}`;
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
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = addDays(weekStart, index);
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
    [appointments, weekStart],
  );

  const weeklyAppointments = weekDays.flatMap((day) => day.appointments);
  const upcomingAppointments = [...appointments]
    .filter(isUpcomingActiveAppointment)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, 12);

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

  function renderAppointment(appointment: Appointment) {
    const disabled = updatingId === appointment.id;
    const status = getAppointmentDisplayStatus(appointment);

    return (
      <article
        className="rounded-lg border border-ocean-100 bg-white p-3 shadow-sm"
        key={appointment.id}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="whitespace-nowrap text-base font-bold leading-none text-ocean-800">
            {appointment.time}
          </p>
          <span
            className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${
              appointmentStatusStyles[status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {status}
          </span>
        </div>

        <div className="mt-3 min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {appointment.patient}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
            {appointment.reason}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Clock className="h-3.5 w-3.5 text-ocean-600" />
            {appointment.duration}
          </span>
          <span className="rounded-full bg-ocean-50 px-2 py-1 font-semibold text-ocean-800">
            {appointment.modality}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <Link
            className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-ocean-200 px-2 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50"
            href={`/dashboard/pacientes/${appointment.patientId}`}
          >
            <UserRound className="h-3.5 w-3.5" />
            Ver paciente
          </Link>

          <details className="relative shrink-0">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-ocean-200 px-2 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50">
              <MoreHorizontal className="h-4 w-4" />
              Acciones
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-44 rounded-lg border border-ocean-100 bg-white p-2 shadow-soft">
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                disabled={disabled}
                onClick={() => askForStatusChange(appointment, "attended")}
                type="button"
              >
                <CheckCircle2 className="h-4 w-4" />
                Asistió
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                disabled={disabled}
                onClick={() => askForStatusChange(appointment, "no_show")}
                type="button"
              >
                <XCircle className="h-4 w-4" />
                No asistió
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                disabled={disabled}
                onClick={() => askForStatusChange(appointment, "cancelled")}
                type="button"
              >
                <XCircle className="h-4 w-4" />
                Cancelar
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-semibold text-ocean-800 hover:bg-ocean-50 disabled:opacity-60"
                disabled={disabled}
                onClick={() => openReschedule(appointment)}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                Reprogramar
              </button>
            </div>
          </details>
        </div>

        {status === "Asistió" ? (
          <Link
            className="mt-3 inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-ocean-600 px-3 text-xs font-semibold text-white transition hover:bg-ocean-700"
            href={`/dashboard/pacientes/${appointment.patientId}`}
          >
            Cargar evolución
          </Link>
        ) : null}
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
                Agenda semanal
              </h1>
              <p className="mt-2 text-sm text-slate-600 sm:text-base">
                Semana del {weekLabel(weekStart)}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="grid grid-cols-3 rounded-lg border border-ocean-100 bg-white p-1">
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setWeekStart((date) => addDays(date, -7))}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                  type="button"
                >
                  Hoy
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setWeekStart((date) => addDays(date, 7))}
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

          {weeklyAppointments.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-white p-8 text-center shadow-sm">
              <p className="font-semibold text-ink">
                No hay turnos para esta semana.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Usá Nuevo turno para programar sesiones.
              </p>
            </div>
          ) : null}

          <section className="mt-6 grid gap-4 xl:grid-cols-7">
            {weekDays.map((day) => (
              <div
                className={`rounded-lg border bg-white p-3 shadow-sm ${
                  day.isToday
                    ? "border-ocean-300 ring-2 ring-ocean-100"
                    : "border-ocean-100"
                }`}
                key={day.date.toISOString()}
              >
                <div
                  className={`mb-3 rounded-lg px-3 py-2 ${
                    day.isToday ? "bg-ocean-600 text-white" : "bg-ocean-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-sm font-bold capitalize ${
                        day.isToday ? "text-white" : "text-ocean-900"
                      }`}
                    >
                      {dayFormatter.format(day.date)}
                    </p>
                    {day.isToday ? (
                      <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
                        Hoy
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="space-y-3">
                  {day.appointments.map(renderAppointment)}
                  {day.appointments.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-ocean-100 bg-ocean-50 p-4 text-center">
                      <p className="text-sm font-medium text-slate-500">
                        Sin turnos
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
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
                      <p className="font-semibold text-ink">
                        {appointment.patient}
                      </p>
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
                      <Link
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                        href={`/dashboard/pacientes/${appointment.patientId}`}
                      >
                        Ver paciente
                      </Link>
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
