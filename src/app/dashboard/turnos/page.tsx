"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Filter,
  MoreVertical,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  type Appointment,
  type AppointmentPaymentInput,
  type AppointmentStatus,
  type PaymentMethod,
  paymentMethodLabels,
  useAppointments,
} from "@/hooks/useAppointments";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
  isUpcomingActiveAppointment,
} from "@/lib/appointment-ui";
import { paymentStatusStyles } from "@/lib/payment-ui";
import { formatDate, formatSessionAmount } from "@/lib/format";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePatients } from "@/hooks/usePatients";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";

type PendingAction = {
  appointment: Appointment;
  status: AppointmentStatus;
  title: string;
  message: string;
  buttonLabel: string;
  tone: "green" | "red" | "rose";
};

type CalendarView = "month" | "week" | "day";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getMonthCalendarDays(date: Date) {
  const firstDay = startOfMonth(date);
  const firstCalendarDay = startOfWeek(firstDay);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  const lastCalendarDay = addDays(startOfWeek(lastDay), 6);
  const days: Date[] = [];
  let current = firstCalendarDay;

  while (current <= lastCalendarDay) {
    days.push(new Date(current));
    current = addDays(current, 1);
  }

  return days;
}

function getCalendarStatusClass(appointment: Appointment) {
  const border =
    appointment.paymentStatus !== "paid" ? "border-amber-400" : "";
  const normalizedStatus = appointment.status.toLowerCase();

  if (
    normalizedStatus.includes("asisti") &&
    !normalizedStatus.includes("no ")
  ) {
    return `bg-emerald-100 text-emerald-800 border-l-2 ${
      border || "border-emerald-500"
    }`;
  }

  if (normalizedStatus.includes("no asisti")) {
    return `bg-red-100 text-red-800 border-l-2 ${border || "border-red-500"}`;
  }

  return `bg-slate-100 text-slate-700 border-l-2 ${
    border || "border-slate-400"
  }`;
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
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { activePatients, loaded: patientsLoaded } = usePatients();
  const {
    appointments,
    error,
    loaded,
    rescheduleAppointment,
    updateAppointmentPayment,
    updateAppointmentStatus,
  } = useAppointments();
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionsAppointment, setActionsAppointment] =
    useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);
  const [editingPayment, setEditingPayment] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [paymentForm, setPaymentForm] = useState<AppointmentPaymentInput>({
    amount: 0,
    paymentMethod: "",
    paymentNotes: "",
  });
  const [view, setView] = useState<CalendarView>("month");
  const [calendarDate, setCalendarDate] = useState(() => new Date());
  const [selectedMobileDay, setSelectedMobileDay] = useState<{
    appointments: Appointment[];
    date: Date;
  } | null>(null);
  const [originFilter, setOriginFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const clinicOptions = useMemo(
    () =>
      Array.from(
        new Map(
          appointments
            .filter((appointment) => appointment.origin === "clinic")
            .map((appointment) => [
              appointment.clinicId ?? appointment.originLabel,
              appointment.originLabel,
            ]),
        ).entries(),
      ),
    [appointments],
  );
  const statusOptions = useMemo(
    () => Array.from(new Set(appointments.map((appointment) => appointment.status))),
    [appointments],
  );
  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        const matchesOrigin =
          originFilter === "all" ||
          (originFilter === "independent" &&
            appointment.origin === "independent") ||
          appointment.clinicId === originFilter;
        const matchesStatus =
          statusFilter === "all" || appointment.status === statusFilter;

        return matchesOrigin && matchesStatus;
      }),
    [appointments, originFilter, statusFilter],
  );

  const upcomingAppointments = [...filteredAppointments]
    .filter(isUpcomingActiveAppointment)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, 12);
  const monthDays = useMemo(
    () => getMonthCalendarDays(calendarDate),
    [calendarDate],
  );
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(calendarDate), index)),
    [calendarDate],
  );
  const timeSlots = useMemo(
    () => Array.from({ length: 13 }, (_, index) => 8 + index),
    [],
  );
  const mobileDays = useMemo(
    () =>
      [-1, 0, 1].map((offset) => {
        const date = addDays(calendarDate, offset);
        const appointmentsForDay = filteredAppointments
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
    [filteredAppointments, calendarDate],
  );
  const visibleAppointments = mobileDays.flatMap((day) => day.appointments);
  const visibleRangeLabel =
    view === "month"
      ? calendarDate.toLocaleDateString("es-AR", {
          month: "long",
          year: "numeric",
        })
      : view === "week"
        ? `${formatDate(weekDays[0])} - ${formatDate(weekDays[6])}`
        : `${formatDate(mobileDays[0]?.date)} - ${formatDate(
            mobileDays[2]?.date,
          )}`;

  function getAppointmentsForDay(date: Date) {
    return filteredAppointments
      .filter((appointment) => sameDay(new Date(appointment.scheduledAt), date))
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
  }

  function handlePreviousPeriod() {
    setCalendarDate((date) =>
      view === "month" ? addMonths(date, -1) : addDays(date, view === "week" ? -7 : -1),
    );
  }

  function handleNextPeriod() {
    setCalendarDate((date) =>
      view === "month" ? addMonths(date, 1) : addDays(date, view === "week" ? 7 : 1),
    );
  }
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

  function openPaymentModal(appointment: Appointment) {
    setActionsAppointment(null);
    setEditingPayment(appointment);
    setPaymentForm({
      amount: appointment.amount,
      paymentMethod: appointment.paymentMethod,
      paymentNotes: appointment.paymentNotes,
    });
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

  if (loading || !loaded || !planLoaded || !patientsLoaded || !workspaceLoaded) {
    return <DashboardLoading />;
  }

  const effectiveAccountType =
    activeWorkspace?.type === "CLINICA" ? "CONSULTORIO" : accountType;
  const canManageClinicSchedule =
    activeWorkspace?.type !== "CLINICA" || activeWorkspace.role === "ADMIN";
  const canCreateAppointment =
    ((effectiveAccountType === "CONSULTORIO" &&
      (plan.plan === "FREE" ||
        (plan.estadoPlan === "ACTIVO" &&
          plan.plan.startsWith("CONSULTORIO_")))) ||
      effectiveAccountType === "KINESIOLOGO") &&
    canManageClinicSchedule;
  const patientLimitBlock = getPatientPlanLimitBlock({
    activePatientCount: activePatients.length,
    patientLimit: plan.limitePacientes,
  });

  async function confirmStatusChange() {
    if (!pendingAction) {
      return;
    }

    setActionError("");
    setActionNotice("");
    setUpdatingId(pendingAction.appointment.id);

    try {
      await updateAppointmentStatus(
        pendingAction.appointment.id,
        pendingAction.status,
      );
      if (pendingAction.status === "attended") {
        openPaymentModal(pendingAction.appointment);
      }
      setActionNotice(
        pendingAction.status === "cancelled"
          ? "Turno cancelado"
          : "Asistencia actualizada",
      );
      setPendingAction(null);
    } catch (updateError) {
      setActionError(
        getFriendlyErrorMessage(updateError, "No pudimos actualizar el turno."),
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
    setActionNotice("");
    setUpdatingId(rescheduling.id);

    try {
      await rescheduleAppointment(
        rescheduling.id,
        rescheduleDate,
        rescheduleTime,
      );
      setRescheduling(null);
      setActionNotice("Turno reprogramado");
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

  async function handlePaymentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingPayment) {
      return;
    }

    setActionError("");
    setActionNotice("");
    setUpdatingId(editingPayment.id);

    try {
      await updateAppointmentPayment(editingPayment.id, paymentForm);
      setEditingPayment(null);
      setActionNotice(
        editingPayment.paymentStatus === "pending"
          ? "Cobro registrado"
          : "Cobro actualizado",
      );
    } catch (paymentError) {
      setActionError(
        getFriendlyErrorMessage(paymentError, "No pudimos guardar el cobro."),
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
          <CheckCircle className="h-4 w-4" />
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
          onClick={() => openPaymentModal(appointment)}
          type="button"
        >
          <CalendarPlus className="h-4 w-4" />
          {appointment.paymentStatus === "pending" ? "Registrar cobro" : "Editar cobro"}
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
    const isAttended = status === "Asistió";
    const canMarkAttended =
      status === "Pendiente" || status === "Sin registrar asistencia";

    return (
      <article
        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
        key={appointment.id}
        style={{ borderLeftColor: appointment.originColor, borderLeftWidth: 5 }}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="whitespace-nowrap text-xs font-bold text-ocean-800">
              {appointment.time}
            </p>
            <Link
              className="mt-1 block min-w-0 truncate text-xs font-semibold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
              href={`/dashboard/pacientes/${appointment.patientId}`}
              title={`Ver detalle de ${appointment.patient}`}
            >
              {appointment.patient}
            </Link>
          </div>
          <span
            className={`w-fit shrink-0 whitespace-nowrap rounded-full px-2 py-1 text-[0.62rem] font-semibold leading-none ${
              appointmentStatusStyles[status] ?? "bg-slate-100 text-slate-700"
            }`}
          >
            {status}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          <span
            className="w-fit rounded-full px-2 py-1 text-[0.62rem] font-semibold text-white"
            style={{ backgroundColor: appointment.originColor }}
          >
            {appointment.originLabel}
          </span>
          <span
            className={`w-fit rounded-full px-2 py-1 text-[0.62rem] font-semibold ${
              paymentStatusStyles[appointment.paymentStatusLabel] ??
              "bg-slate-100 text-slate-700"
            }`}
          >
            {appointment.paymentStatusLabel}
          </span>
          <span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-[0.62rem] font-semibold text-slate-600">
            {formatSessionAmount(appointment.amount)}
          </span>
        </div>

        {appointment.conflictWarning ? (
          <p className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-2 py-1.5 text-[0.68rem] font-semibold leading-4 text-amber-800">
            Conflicto de agenda: {appointment.conflictWarning}
          </p>
        ) : null}

        <div className="mt-2 flex items-center gap-2">
          {canMarkAttended ? (
            <button
              className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-emerald-600 px-2 text-[0.68rem] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              disabled={isFutureAppointment(appointment)}
              onClick={() => openStatusModal(appointment, "attended")}
              type="button"
            >
              Marcar asistió
            </button>
          ) : isAttended ? (
            <Link
              className="inline-flex min-h-8 flex-1 items-center justify-center rounded-lg bg-ocean-600 px-2 text-[0.68rem] font-semibold text-white transition hover:bg-ocean-700"
              href={`/dashboard/pacientes/${appointment.patientId}?appointment=${appointment.id}`}
            >
              Evolución
            </Link>
          ) : null}
          <button
            className="flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 text-[0.68rem] font-semibold text-slate-600 transition hover:bg-slate-50 xl:hidden"
            onClick={() => setActionsAppointment(appointment)}
            type="button"
          >
            <MoreVertical className="h-3.5 w-3.5" />
            Acciones
          </button>

          <details className="relative hidden flex-1 xl:block">
            <summary className="flex min-h-8 cursor-pointer list-none items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 text-[0.68rem] font-semibold text-slate-600 transition hover:bg-slate-50">
              <MoreVertical className="h-3.5 w-3.5" />
              Acciones
            </summary>
            <div className="absolute right-0 z-20 mt-2 w-56 rounded-lg border border-ocean-100 bg-white p-2 shadow-soft">
              {renderActionItems(appointment)}
            </div>
          </details>
        </div>
      </article>
    );
  }

  function renderMonthView() {
    return (
      <section className="mt-4 overflow-hidden rounded-lg border border-ocean-100 bg-white shadow-card sm:mt-6">
        <div className="grid grid-cols-7 border-b border-ocean-100 bg-ocean-50 text-center text-xs font-bold text-slate-500">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
            <div className="px-2 py-3" key={day}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const dayAppointments = getAppointmentsForDay(day);
            const isOutsideMonth = day.getMonth() !== calendarDate.getMonth();
            const isToday = sameDay(day, new Date());

            return (
              <div
                className={`min-h-24 border-b border-r border-ocean-100 p-2 text-left transition hover:bg-ocean-50 md:min-h-36 ${
                  isOutsideMonth ? "opacity-40" : ""
                } ${isToday ? "border-ocean-400 ring-2 ring-ocean-100" : ""}`}
                key={day.toISOString()}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  const pill = target.closest(
                    "[data-appointment-id]",
                  ) as HTMLElement | null;

                  if (pill) {
                    const id = pill.dataset.appointmentId;
                    const appointment = appointments.find((item) => item.id === id);

                    if (appointment) {
                      setActionsAppointment(appointment);
                    }

                    return;
                  }

                  setSelectedMobileDay({ appointments: dayAppointments, date: day });
                }}
              >
                <span className="text-sm font-bold text-ink">
                  {day.getDate()}
                </span>
                <div className="mt-2 flex flex-wrap gap-1 md:hidden">
                  {dayAppointments.slice(0, 6).map((appointment) => (
                    <span
                      className="h-2 w-2 rounded-full"
                      key={appointment.id}
                      style={{ backgroundColor: appointment.originColor }}
                      title={appointment.originLabel}
                    />
                  ))}
                </div>
                <div className="mt-2 hidden space-y-1 md:block">
                  {dayAppointments.slice(0, 3).map((appointment) => (
                    <div
                      className={`flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-semibold ${getCalendarStatusClass(appointment)}`}
                      data-appointment-id={appointment.id}
                      key={appointment.id}
                      style={{ borderLeftColor: appointment.originColor }}
                      title={`${appointment.patient} · ${appointment.originLabel}`}
                    >
                      <span className="pointer-events-none truncate">
                        {appointment.time} {appointment.patient}
                      </span>
                      {appointment.paymentStatus !== "paid" ? (
                        <DollarSign className="pointer-events-none h-3 w-3 shrink-0" />
                      ) : null}
                    </div>
                  ))}
                  {dayAppointments.length > 3 ? (
                    <p className="px-2 text-xs font-semibold text-slate-500">
                      +{dayAppointments.length - 3} mas
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  function renderWeekView() {
    return (
      <section className="mt-4 overflow-x-auto rounded-lg border border-ocean-100 bg-white shadow-card sm:mt-6">
        <div className="grid min-w-[56rem] grid-cols-7 border-b border-ocean-100">
          {weekDays.map((day) => {
            const isToday = sameDay(day, new Date());

            return (
              <div className="border-r border-ocean-100 p-3 text-center" key={day.toISOString()}>
                <span
                  className={`inline-flex min-h-8 items-center justify-center rounded-full px-3 text-sm font-bold capitalize ${
                    isToday ? "bg-ocean-600 text-white" : "text-ink"
                  }`}
                >
                  {day.toLocaleDateString("es-AR", {
                    day: "2-digit",
                    weekday: "short",
                  })}
                </span>
              </div>
            );
          })}
        </div>
        <div className="grid min-w-[56rem] grid-cols-7">
          {weekDays.map((day) => (
            <div className="border-r border-ocean-100" key={day.toISOString()}>
              {timeSlots.map((hour) => {
                const slotAppointments = getAppointmentsForDay(day).filter(
                  (appointment) =>
                    new Date(appointment.scheduledAt).getHours() === hour,
                );

                return (
                  <div
                    className="min-h-[48px] border-b border-ocean-100 p-1.5"
                    key={`${day.toISOString()}-${hour}`}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      const pill = target.closest(
                        "[data-appointment-id]",
                      ) as HTMLElement | null;

                      if (pill) {
                        const id = pill.dataset.appointmentId;
                        const appointment = appointments.find(
                          (item) => item.id === id,
                        );

                        if (appointment) {
                          setActionsAppointment(appointment);
                        }
                      }
                    }}
                  >
                    <p className="text-[0.68rem] font-semibold text-slate-400">
                      {String(hour).padStart(2, "0")}:00
                    </p>
                    <div className="mt-1 space-y-1">
                      {slotAppointments.map((appointment) => (
                        <div
                          className={`flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left text-xs font-semibold ${getCalendarStatusClass(appointment)}`}
                          data-appointment-id={appointment.id}
                          key={appointment.id}
                        >
                          <span className="pointer-events-none truncate">
                            {appointment.time} {appointment.patient}
                          </span>
                          {appointment.paymentStatus !== "paid" ? (
                            <DollarSign className="pointer-events-none h-3 w-3 shrink-0" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer>
          <PageHeader
            actions={
              <>
              <div className="grid grid-cols-3 rounded-lg border border-ocean-100 bg-white p-1">
                {[
                  ["month", "Mes"],
                  ["week", "Semana"],
                  ["day", "Día"],
                ].map(([value, label]) => (
                  <button
                    className={`inline-flex min-h-10 items-center justify-center rounded-md px-3 text-xs font-semibold transition sm:text-sm ${
                      view === value
                        ? "bg-ocean-600 text-white"
                        : "text-slate-700 hover:bg-ocean-50"
                    }`}
                    key={value}
                    onClick={() => setView(value as CalendarView)}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 rounded-lg border border-ocean-100 bg-white p-1">
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={handlePreviousPeriod}
                  type="button"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-md px-2 text-xs font-semibold text-ocean-800 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={() => setCalendarDate(new Date())}
                  type="button"
                >
                  Hoy
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 transition hover:bg-ocean-50 sm:text-sm"
                  onClick={handleNextPeriod}
                  type="button"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {patientLimitBlock ? (
                <button
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500"
                  disabled
                  title={patientLimitBlock}
                  type="button"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Nuevo turno
                </button>
              ) : canCreateAppointment ? (
                <Link
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                  href="/dashboard/turnos/nuevo"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Nuevo turno
                </Link>
              ) : null}
              </>
            }
            description={<>{visibleRangeLabel}</>}
            eyebrow="Turnos"
            title="Agenda"
          />

          <div className="mt-4 flex flex-wrap gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-sm sm:mt-6">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              Asistió
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              No asistió
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
              Pendiente
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-4 border-l-2 border-dashed border-amber-400" />
              Sin cobrar
            </span>
          </div>

          {patientLimitBlock ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              <p>{patientLimitBlock}</p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Reactivar plan
              </Link>
            </section>
          ) : null}

          {!patientLimitBlock && effectiveAccountType === "KINESIOLOGO" && !canCreateAppointment ? (
            <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 text-sm font-medium text-slate-600 shadow-sm sm:mt-6">
              Con el Plan Free podés probar KineFlow con hasta 5 pacientes.
              Para programar turnos propios y gestionar pacientes ilimitados,
              activá KineFlow - Particular.
            </section>
          ) : null}

          {error || actionError ? (
            <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:mt-6">
              {actionError || error}
            </p>
          ) : null}

          {actionNotice ? (
            <p className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 sm:mt-6">
              {actionNotice}
            </p>
          ) : null}

          <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-3 shadow-sm sm:mt-6 sm:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="flex items-center gap-2 font-semibold text-ink">
                <Filter className="h-4 w-4 text-ocean-700" />
                Filtros
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <select
                  className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-ocean-400"
                  onChange={(event) => setOriginFilter(event.target.value)}
                  value={originFilter}
                >
                  <option value="all">Todos</option>
                  <option value="independent">Propios</option>
                  {clinicOptions.map(([clinicId, clinicName]) => (
                    <option key={clinicId} value={clinicId}>
                      {clinicName}
                    </option>
                  ))}
                </select>
                <select
                  className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-ocean-400"
                  onChange={(event) => setStatusFilter(event.target.value)}
                  value={statusFilter}
                >
                  <option value="all">Todos los estados</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {view === "month" ? renderMonthView() : null}
          {view === "week" ? renderWeekView() : null}

          {view === "day" && visibleAppointments.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-white p-5 text-center shadow-card sm:mt-6 sm:p-8">
              <p className="font-semibold text-ink">
                No hay turnos para estos dias.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Usa Nuevo turno para programar sesiones.
              </p>
            </div>
          ) : null}

          {view === "day" ? (
            <section className="mt-4 sm:mt-6">
              <div className="grid gap-4 lg:grid-cols-3">
                {mobileDays.map((day, index) => (
                  <div
                    className={`${
                      index === 1 ? "block" : "hidden lg:block"
                    } rounded-lg border bg-white p-3 shadow-card ${
                      day.isToday
                        ? "border-ocean-300 ring-2 ring-ocean-100"
                        : "border-ocean-100"
                    }`}
                    key={day.date.toISOString()}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3 border-b border-ocean-100 pb-3">
                      <div>
                        <p className="text-sm font-bold capitalize text-ink">
                          {compactDayLabel(day.date)}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">
                          {formatDate(day.date)}
                        </p>
                      </div>
                      <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-semibold text-ocean-800">
                        {day.appointments.length}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {day.appointments.map(renderAppointment)}
                      {day.appointments.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-ocean-100 bg-ocean-50 p-4 text-center">
                          <p className="text-sm font-medium text-slate-500">
                            No hay turnos para este dia.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:mt-6 sm:p-5">
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
                        {appointment.modality} - {appointment.originLabel}
                      </p>
                      {appointment.conflictWarning ? (
                        <p className="mt-2 text-sm font-semibold text-amber-700">
                          Conflicto de agenda: {appointment.conflictWarning}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="w-fit rounded-full px-3 py-1 text-sm font-semibold text-white"
                        style={{ backgroundColor: appointment.originColor }}
                      >
                        {appointment.originLabel}
                      </span>
                      <span
                        className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                          appointmentStatusStyles[status] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {status}
                      </span>
                      <span
                        className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                          paymentStatusStyles[appointment.paymentStatusLabel] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {appointment.paymentStatusLabel} ·{" "}
                        {formatSessionAmount(appointment.amount)}
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

          {selectedMobileDay ? (
            <div className="fixed inset-0 z-40 flex items-end bg-ink/40 px-3 pb-3 md:hidden">
              <div className="w-full rounded-t-2xl border border-ocean-100 bg-white p-4 shadow-soft">
                <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200" />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-ink">
                      {formatDate(selectedMobileDay.date)}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selectedMobileDay.appointments.length} turnos
                    </p>
                  </div>
                  <button
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-ocean-100 text-slate-500"
                    onClick={() => setSelectedMobileDay(null)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-4 divide-y divide-ocean-100">
                  {selectedMobileDay.appointments.map((appointment) => (
                    <button
                      className="flex w-full items-center gap-3 px-1 py-3 text-left"
                      key={appointment.id}
                      onClick={() => {
                        setSelectedMobileDay(null);
                        setActionsAppointment(appointment);
                      }}
                      type="button"
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: appointment.originColor }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink">
                          {appointment.patient}
                        </span>
                        <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                          {appointment.time}
                        </span>
                      </span>
                    </button>
                  ))}
                  {selectedMobileDay.appointments.length === 0 ? (
                    <p className="py-5 text-center text-sm font-semibold text-slate-500">
                      No hay turnos para este dia.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {actionsAppointment ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-3 pb-3">
              <div className="w-full max-w-sm rounded-xl border border-ocean-100 bg-white p-4 shadow-soft">
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
            <div className="fixed inset-0 z-50 flex items-end bg-ink/70 px-3 pb-3 sm:items-center sm:justify-center sm:bg-ink/40 sm:px-4 sm:py-6">
              <div className="min-h-[60vh] w-full rounded-t-2xl border border-ocean-100 bg-white p-5 shadow-soft sm:min-h-0 sm:max-w-md sm:rounded-lg">
                <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200 sm:hidden" />
                <h2 className="text-lg font-bold text-ink">
                  {pendingAction.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {pendingAction.message}
                </p>
                <div className="mt-4 rounded-lg bg-ocean-50 p-4 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold text-ink">Paciente:</span>{" "}
                    {pendingAction.appointment.patient}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-ink">Turno:</span>{" "}
                    {pendingAction.appointment.date} a las{" "}
                    {pendingAction.appointment.time}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-ink">
                      Estado actual:
                    </span>{" "}
                    {getAppointmentDisplayStatus(pendingAction.appointment)}
                  </p>
                  <p className="mt-1">
                    <span className="font-semibold text-ink">
                      Acción a confirmar:
                    </span>{" "}
                    {pendingAction.buttonLabel}
                  </p>
                </div>
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
                  {rescheduling.patient}
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

          {editingPayment ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6">
              <form
                className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
                onSubmit={handlePaymentSubmit}
              >
                <h2 className="text-lg font-bold text-ink">Editar cobro</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {editingPayment.patient} · {editingPayment.date} ·{" "}
                  {editingPayment.time}
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Monto
                    </span>
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
                    <span className="text-sm font-semibold text-slate-700">
                      Medio de pago
                    </span>
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
                    onClick={() => setEditingPayment(null)}
                    type="button"
                  >
                    Cancelar
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                    disabled={updatingId === editingPayment.id}
                    type="submit"
                  >
                    Guardar cobro
                  </button>
                </div>
              </form>
            </div>
          ) : null}
      </PageContainer>
    </main>
  );
}
