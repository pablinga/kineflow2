"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
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
import { useRequireAuth } from "@/hooks/useRequireAuth";

const dayFormatter = new Intl.DateTimeFormat("es-AR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const statusStyles: Record<string, string> = {
  Pendiente: "bg-amber-50 text-amber-700",
  Asistió: "bg-emerald-50 text-emerald-700",
  Cancelado: "bg-red-50 text-red-700",
  "No asistió": "bg-slate-200 text-slate-700",
  Reprogramado: "bg-ocean-50 text-ocean-800",
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

export default function AppointmentsPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { appointments, error, loaded, updateAppointmentStatus } =
    useAppointments();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

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

        return { appointments: appointmentsForDay, date };
      }),
    [appointments, weekStart],
  );

  const weeklyAppointments = weekDays.flatMap((day) => day.appointments);

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

  async function handleStatusChange(
    appointment: Appointment,
    status: AppointmentStatus,
  ) {
    setActionError("");
    setUpdatingId(appointment.id);

    try {
      await updateAppointmentStatus(appointment.id, status);
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

  function renderAppointment(appointment: Appointment) {
    const disabled = updatingId === appointment.id;

    return (
      <article
        className="rounded-lg border border-ocean-100 bg-white p-4 shadow-sm"
        key={appointment.id}
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <p className="whitespace-nowrap text-2xl font-bold text-ocean-800">
              {appointment.time}
            </p>
            <p className="mt-1 font-semibold text-ink">{appointment.patient}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {appointment.reason}
            </p>
          </div>
          <span
            className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
              statusStyles[appointment.status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {appointment.status}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-ocean-600" />
            {appointment.duration}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4 text-ocean-600" />
            {appointment.modality}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-100 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onClick={() => handleStatusChange(appointment, "attended")}
            type="button"
          >
            <CheckCircle2 className="h-4 w-4" />
            Asistió
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-red-100 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onClick={() => handleStatusChange(appointment, "cancelled")}
            type="button"
          >
            <XCircle className="h-4 w-4" />
            Cancelar
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onClick={() => handleStatusChange(appointment, "no_show")}
            type="button"
          >
            No asistió
          </button>
          <button
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={disabled}
            onClick={() => handleStatusChange(appointment, "rescheduled")}
            type="button"
          >
            <RotateCcw className="h-4 w-4" />
            Reprogramar
          </button>
          <Link
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            href={`/dashboard/pacientes/${appointment.patientId}`}
          >
            <UserRound className="h-4 w-4" />
            Ver paciente
          </Link>
          {appointment.status === "Asistió" ? (
            <Link
              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-ocean-600 px-3 text-sm font-semibold text-white transition hover:bg-ocean-700"
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
              <h1 className="mt-1 text-3xl font-bold text-ink">Agenda semanal</h1>
              <p className="mt-2 text-slate-600">
                Semana del {weekLabel(weekStart)}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex rounded-lg border border-ocean-100 bg-white p-1">
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50"
                  onClick={() => setWeekStart((date) => addDays(date, -7))}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  onClick={() => setWeekStart(startOfWeek(new Date()))}
                  type="button"
                >
                  Hoy
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-700 transition hover:bg-ocean-50"
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
                className="rounded-lg border border-ocean-100 bg-white p-3 shadow-sm"
                key={day.date.toISOString()}
              >
                <div className="mb-3 rounded-lg bg-ocean-50 px-3 py-2">
                  <p className="text-sm font-bold capitalize text-ocean-900">
                    {dayFormatter.format(day.date)}
                  </p>
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
        </div>
      </section>
    </main>
  );
}
