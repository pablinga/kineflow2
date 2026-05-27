"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  ClipboardPlus,
  CreditCard,
  FileText,
  Search,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useAppointments } from "@/hooks/useAppointments";
import { useEvolutions } from "@/hooks/useEvolutions";
import { usePatients } from "@/hooks/usePatients";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
  isPastPendingAppointment,
  isUpcomingActiveAppointment,
} from "@/lib/appointment-ui";
import {
  formatCurrency,
  getPaymentDate,
  isAttendedPendingPayment,
  paymentStatusStyles,
} from "@/lib/payment-ui";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - day + 1);
  return next;
}

function endOfWeek(date: Date) {
  const next = startOfWeek(date);
  next.setDate(next.getDate() + 7);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
}

export default function DashboardPage() {
  const { authError, displayName, loading, redirecting } = useRequireAuth();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const {
    activePatients,
    loaded: patientsLoaded,
    patients,
  } = usePatients();
  const { appointments, loaded: appointmentsLoaded } = useAppointments();
  const { evolutions, loaded: evolutionsLoaded } = useEvolutions();

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

  if (
    loading ||
    !patientsLoaded ||
    !appointmentsLoaded ||
    !evolutionsLoaded ||
    !planLoaded
  ) {
    return <DashboardLoading />;
  }

  const pendingAppointments = appointments.filter((appointment) =>
    ["Pendiente", "Sin registrar asistencia"].includes(
      getAppointmentDisplayStatus(appointment),
    ),
  );
  const upcomingAppointments = [...appointments]
    .filter(isUpcomingActiveAppointment)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .slice(0, 6);
  const actionRequired = appointments.filter(isPastPendingAppointment);
  const paymentActionRequired = appointments.filter(isAttendedPendingPayment);
  const currentWeekStart = startOfWeek(new Date()).getTime();
  const currentWeekEnd = endOfWeek(new Date()).getTime();
  const currentMonthStart = startOfMonth(new Date());
  const currentMonthEnd = endOfMonth(new Date());
  const appointmentsThisWeek = appointments.filter((appointment) => {
    const scheduledAt = new Date(appointment.scheduledAt).getTime();
    return scheduledAt >= currentWeekStart && scheduledAt < currentWeekEnd;
  });
  const paidAppointments = appointments.filter(
    (appointment) => appointment.paymentStatus === "paid",
  );
  const weekIncome = paidAppointments
    .filter((appointment) => {
      const paymentDate = getPaymentDate(appointment).getTime();
      return paymentDate >= currentWeekStart && paymentDate < currentWeekEnd;
    })
    .reduce((total, appointment) => total + appointment.amount, 0);
  const monthIncome = paidAppointments
    .filter((appointment) => {
      const paymentDate = getPaymentDate(appointment).getTime();
      return paymentDate >= currentMonthStart && paymentDate < currentMonthEnd;
    })
    .reduce((total, appointment) => total + appointment.amount, 0);
  const pendingPaymentAppointments = appointments.filter(
    (appointment) =>
      appointment.paymentStatus === "pending" && appointment.amount > 0,
  );
  const pendingPaymentAmount = pendingPaymentAppointments.reduce(
    (total, appointment) => total + appointment.amount,
    0,
  );

  const summaryCards = [
    {
      label: "Pacientes activos",
      value: String(activePatients.length),
      detail: patients.length === 0 ? "Sin pacientes cargados" : "En seguimiento",
    },
    {
      label: "Sesiones esta semana",
      value: String(appointmentsThisWeek.length),
      detail:
        appointmentsThisWeek.length === 0
          ? "Sin sesiones esta semana"
          : "Turnos de la semana",
    },
    {
      label: "Turnos pendientes",
      value: String(pendingAppointments.length),
      detail:
        pendingAppointments.length === 0
          ? "Sin turnos pendientes"
          : "Requieren seguimiento",
    },
    {
      label: "Evoluciones registradas",
      value: String(evolutions.length),
      detail: "Historial clínico",
    },
  ];
  const economicCards = [
    {
      label: "Ingresos de la semana",
      value: formatCurrency(weekIncome),
      detail: "Cobros registrados",
    },
    {
      label: "Ingresos del mes",
      value: formatCurrency(monthIncome),
      detail: "Cobros registrados",
    },
    {
      label: "Sesiones pendientes de cobro",
      value: String(pendingPaymentAppointments.length),
      detail: "Con monto pendiente",
    },
    {
      label: "Monto pendiente",
      value: formatCurrency(pendingPaymentAmount),
      detail: "Por cobrar",
    },
  ];

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Dashboard</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Bienvenida, {displayName}
              </h1>
              <p className="mt-2 text-slate-600">
                Resumen operativo de pacientes, agenda y seguimiento clínico.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-white px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50"
                href="/dashboard/pacientes"
              >
                <Search className="h-4 w-4" />
                Buscar paciente
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/dashboard/turnos/nuevo"
              >
                <CalendarPlus className="h-4 w-4" />
                Nuevo turno
              </Link>
            </div>
          </header>

          {plan.plan === "FREE" ? (
            <section className="mt-6 flex flex-col justify-between gap-4 rounded-lg border border-ocean-200 bg-white p-5 shadow-sm md:flex-row md:items-center">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold text-ink">
                    Actualmente estas usando el Plan Free.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Activa un plan pago para acceder a pacientes ilimitados y
                    funciones avanzadas.
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/dashboard/planes"
              >
                Activar plan
              </Link>
            </section>
          ) : null}

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
                key={card.label}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-3 text-3xl font-bold text-ink">
                      {card.value}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ocean-700">
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {economicCards.map((card) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
                key={card.label}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-3 text-2xl font-bold text-ink">
                      {card.value}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <WalletCards className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ocean-700">
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_0.8fr]">
            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-ink">Próximos turnos</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Ordenados por fecha y hora.
                  </p>
                </div>
                <Link
                  className="text-sm font-semibold text-ocean-700"
                  href="/dashboard/turnos"
                >
                  Ver agenda
                </Link>
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
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${
                            appointmentStatusStyles[status]
                          }`}
                        >
                          {status}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${
                            paymentStatusStyles[
                              appointment.paymentStatusLabel
                            ] ?? "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {appointment.paymentStatusLabel}
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
            </div>

            <div className="space-y-6">
              <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-ink">Requieren acción</h2>
                <div className="mt-4 space-y-3">
                  {actionRequired.map((appointment) => (
                    <Link
                      className="block rounded-lg border border-orange-100 bg-orange-50 p-3 transition hover:bg-orange-100"
                      href={`/dashboard/pacientes/${appointment.patientId}`}
                      key={appointment.id}
                    >
                      <p className="text-sm font-semibold text-orange-800">
                        Sin registrar asistencia
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {appointment.patient} · {appointment.date} {appointment.time}
                      </p>
                    </Link>
                  ))}
                  {paymentActionRequired.map((appointment) => (
                    <Link
                      className="block rounded-lg border border-amber-100 bg-amber-50 p-3 transition hover:bg-amber-100"
                      href="/dashboard/ingresos"
                      key={`payment-${appointment.id}`}
                    >
                      <p className="text-sm font-semibold text-amber-800">
                        Cobro pendiente
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {appointment.patient} · {appointment.date}{" "}
                        {appointment.time} · {formatCurrency(appointment.amount)}
                      </p>
                    </Link>
                  ))}
                </div>
                {actionRequired.length === 0 &&
                paymentActionRequired.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm text-slate-600">
                    No hay alertas pendientes.
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-ink">Accesos rápidos</h2>
                <div className="mt-4 grid gap-2">
                  {[
                    {
                      label: "Nuevo paciente",
                      href: "/dashboard/pacientes?nuevo=1",
                      icon: UsersRound,
                    },
                    {
                      label: "Nuevo turno",
                      href: "/dashboard/turnos/nuevo",
                      icon: CalendarPlus,
                    },
                    {
                      label: "Registrar evolución",
                      href: "/dashboard/pacientes",
                      icon: ClipboardPlus,
                    },
                    {
                      label: "Crear informe",
                      href: "/dashboard/pacientes",
                      icon: FileText,
                    },
                    {
                      label: "Ver ingresos",
                      href: "/dashboard/ingresos",
                      icon: WalletCards,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        className="flex min-h-11 items-center justify-between rounded-lg border border-ocean-100 px-3 text-sm font-semibold text-slate-700 transition hover:border-ocean-200 hover:bg-ocean-50"
                        href={item.href}
                        key={item.label}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-ocean-600" />
                          {item.label}
                        </span>
                        <ArrowUpRight className="h-4 w-4 text-slate-400" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-ink">Pacientes recientes</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Acceso rápido para retomar tratamientos.
                </p>
              </div>
              <Link
                className="text-sm font-semibold text-ocean-700"
                href="/dashboard/pacientes"
              >
                Ver pacientes
              </Link>
            </div>
            <div className="mt-5 divide-y divide-ocean-100">
              {patients.slice(0, 6).map((patient) => (
                <div
                  className="grid gap-3 py-4 md:grid-cols-[1fr_1fr_auto] md:items-center"
                  key={patient.id}
                >
                  <div>
                    <p className="font-semibold text-ink">{patient.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {patient.condition}
                    </p>
                  </div>
                  <div className="text-sm text-slate-600">
                    <p>Último turno: {patient.lastSession}</p>
                    <p>Última evolución: {patient.progress}</p>
                  </div>
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    href={`/dashboard/pacientes/${patient.id}`}
                  >
                    Ver paciente
                  </Link>
                </div>
              ))}
            </div>
            {patients.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                <p className="font-semibold text-ink">
                  Todavía no hay pacientes cargados.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
