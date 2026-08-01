"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  ClipboardPlus,
  CreditCard,
  UserRound,
  Search,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { PendingClinicInvitationsBanner } from "@/components/dashboard/PendingClinicInvitationsBanner";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  appointmentStatusStyles,
} from "@/lib/appointment-ui";
import { paymentStatusStyles } from "@/lib/payment-ui";
import { getPlanDisplayName } from "@/lib/plans";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { usePendingClinicInvitations } from "@/hooks/usePendingClinicInvitations";

function getAttendanceBadgeLabel(status: string) {
  return status === "Pendiente" ? "Pendiente asistencia" : status;
}

function getAttendanceBadgeClass(status: string) {
  if (status === "Pendiente") {
    return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }

  return appointmentStatusStyles[status] ?? "bg-sky-50 text-sky-700";
}

function getAppointmentDisplayStatus(appointment: { scheduledAt: string; status: string }) {
  return appointment.status === "Pendiente" &&
    new Date(appointment.scheduledAt).getTime() < Date.now()
    ? "Sin registrar asistencia"
    : appointment.status;
}

function getPaymentBadge(appointment: { amount: number; paymentStatus: string; paymentStatusLabel: string }) {
  if (appointment.paymentStatus === "pending") {
    return {
      className:
        appointment.amount > 0
          ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
          : "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
      label: appointment.amount > 0 ? "Pendiente de cobro" : "Sin cobrar",
    };
  }

  return {
    className:
      paymentStatusStyles[appointment.paymentStatusLabel] ??
      "bg-slate-100 text-slate-700",
    label: appointment.paymentStatusLabel,
  };
}

export default function DashboardPage() {
  const { authError, displayName, loading, redirecting, user } = useRequireAuth();
  const {
    activeWorkspace,
    loaded: workspaceLoaded,
    refreshWorkspaces,
  } = useActiveWorkspace();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const {
    error: dashboardError,
    loaded: dashboardLoaded,
    summary,
  } = useDashboardSummary();
  const {
    acceptInvitation,
    actionError: invitationActionError,
    notice: invitationNotice,
    pendingInvitations,
    rejectInvitation,
  } = usePendingClinicInvitations(user);

  async function handleAcceptInvitation(id: string) {
    await acceptInvitation(id);
    await refreshWorkspaces();
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

  if (
    loading ||
    !dashboardLoaded ||
    !planLoaded ||
    !workspaceLoaded
  ) {
    return <DashboardLoading />;
  }

  const currentPlanName = getPlanDisplayName(plan.plan);
  const isClinicWorkspace = activeWorkspace?.type === "CLINICA";
  const patientLimitBlock = isClinicWorkspace
    ? null
    : getPatientPlanLimitBlock({
        activePatientCount: summary.activePatientCount,
        patientLimit: plan.limitePacientes,
      });
  const dashboardTitle = isClinicWorkspace
    ? `Panel de ${activeWorkspace.name}`
    : `Hola, ${displayName}`;
  const dashboardDescription = isClinicWorkspace
    ? "Equipo, pacientes, agenda e ingresos de la clínica en un solo lugar."
    : "Pacientes, turnos, evoluciones y cobros en un solo lugar.";
  const upcomingAppointments = summary.upcomingAppointments;
  const actionRequired = summary.actionRequired;
  const paymentActionRequired = summary.paymentActionRequired;
  const nextAppointment = upcomingAppointments[0];

  const summaryCards = [
    {
      label: "Turnos de hoy",
      value: String(summary.appointmentsTodayCount),
      detail:
        summary.appointmentsTodayCount === 0
          ? "Sin turnos para hoy"
          : "Agenda del dia",
    },
    {
      label: "Pacientes activos",
      value: String(summary.activePatientCount),
      detail:
        summary.totalPatientCount === 0 ? "Sin pacientes cargados" : "En seguimiento",
    },
    {
      label: "Próximo turno",
      value: nextAppointment?.time ?? "-",
      detail: nextAppointment
        ? `${nextAppointment.patient} · ${nextAppointment.date}`
        : "Sin próximos turnos",
    },
  ];
  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer>
          <PageHeader
            actions={
              <>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-white px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50"
                href="/dashboard/pacientes"
              >
                <Search className="h-4 w-4" />
                Buscar paciente
              </Link>
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
              ) : (
                <Link
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                  href="/dashboard/turnos/nuevo"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Nuevo turno
                </Link>
              )}
              </>
            }
            description={dashboardDescription}
            eyebrow="Dashboard"
            title={dashboardTitle}
          />

          <PendingClinicInvitationsBanner
            actionError={invitationActionError}
            invitations={pendingInvitations}
            notice={invitationNotice}
            onAccept={handleAcceptInvitation}
            onReject={rejectInvitation}
          />

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

          {dashboardError ? (
            <section className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700 sm:mt-6 sm:p-5">
              <p>{dashboardError}</p>
            </section>
          ) : null}

          {plan.plan === "FREE" ? (
            <section className="mt-4 flex flex-col justify-between gap-4 rounded-lg border border-ocean-200 bg-white p-4 shadow-card sm:mt-6 sm:p-5 md:flex-row md:items-center">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold text-ink">
                    Actualmente estás usando el Plan Free.
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Activá un plan pago para acceder a pacientes ilimitados y
                    funciones avanzadas.
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/dashboard/planes"
              >
                Activár plan
              </Link>
            </section>
          ) : (
            <section className="mt-4 flex flex-col justify-between gap-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 shadow-card sm:mt-6 sm:p-5 md:flex-row md:items-center">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-bold text-emerald-950">
                    {plan.estadoPlan === "ACTIVO"
                      ? `Plan activo: ${currentPlanName}`
                      : `Plan actual: ${currentPlanName}`}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-emerald-800">
                    {plan.estadoPlan === "ACTIVO"
                      ? "Tu suscripción está activa."
                      : "Estado: pendiente de confirmacion de Mercado Pago."}
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                href="/dashboard/planes"
              >
                Ver mi plan
              </Link>
            </section>
          )}

          <section className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-3">
            {summaryCards.map((card) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-3 shadow-card sm:p-4"
                key={card.label}
              >
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {card.value}
                </p>
                <p className="mt-3 text-sm font-medium text-ocean-700">
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_0.8fr] sm:mt-6 sm:gap-6">
            <div className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
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
              <div className="mt-4 divide-y divide-ocean-100">
                {upcomingAppointments.map((appointment) => {
                  const status = getAppointmentDisplayStatus(appointment);
                  const paymentBadge = getPaymentBadge(appointment);

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
                          prefetch={false}
                        >
                          {appointment.patient}
                        </Link>
                        <p className="mt-1 text-sm text-slate-500">
                          {appointment.modality}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${
                            getAttendanceBadgeClass(status)
                          }`}
                          title="Estado de asistencia"
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <UserRound className="h-3.5 w-3.5" />
                            {getAttendanceBadgeLabel(status)}
                          </span>
                        </span>
                        <span
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${paymentBadge.className}`}
                          title="Estado de cobro"
                        >
                          {paymentBadge.label}
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
              <div className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
                <h2 className="text-lg font-bold text-ink">Requieren acción</h2>
                <div className="mt-4 space-y-3">
                  {actionRequired.length > 0 ? (
                    <Link
                      className="block rounded-lg border border-amber-100 bg-amber-50 p-3 transition hover:bg-amber-100"
                      href="/dashboard/turnos"
                    >
                      <p className="text-sm font-semibold text-amber-800">
                        {actionRequired.length}{" "}
                        {actionRequired.length === 1
                          ? "turno sin registrar asistencia"
                          : "turnos sin registrar asistencia"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-700">
                        Revisar
                      </p>
                    </Link>
                  ) : null}
                  {paymentActionRequired.length > 0 ? (
                    <Link
                      className="block rounded-lg border border-amber-100 bg-amber-50 p-3 transition hover:bg-amber-100"
                      href="/dashboard/ingresos"
                    >
                      <p className="text-sm font-semibold text-amber-800">
                        {paymentActionRequired.length}{" "}
                        {paymentActionRequired.length === 1
                          ? "cobro pendiente"
                          : "cobros pendientes"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-700">
                        Revisar
                      </p>
                    </Link>
                  ) : null}                </div>
                {actionRequired.length === 0 &&
                paymentActionRequired.length === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm text-slate-600">
                    No hay alertas pendientes.
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
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
                      label: "Ver ingresos",
                      href: "/dashboard/ingresos",
                      icon: WalletCards,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    const blockedByPatientLimit =
                      Boolean(patientLimitBlock) &&
                      (item.href === "/dashboard/pacientes?nuevo=1" ||
                        item.href === "/dashboard/turnos/nuevo" ||
                        item.href === "/dashboard/pacientes");

                    if (blockedByPatientLimit) {
                      return (
                        <button
                          className="flex min-h-11 cursor-not-allowed items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-400"
                          disabled
                          key={item.label}
                          title={patientLimitBlock ?? undefined}
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-slate-400" />
                            {item.label}
                          </span>
                          <ArrowUpRight className="h-4 w-4 text-slate-300" />
                        </button>
                      );
                    }

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

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
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
              {summary.recentPatients.map((patient) => (
                <div
                  className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-center"
                  key={patient.id}
                >
                  <div>
                    <p className="font-semibold text-ink">{patient.name}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {patient.condition}
                    </p>
                  </div>
                  <Link
                    className="inline-flex min-h-9 items-center justify-center rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    href={`/dashboard/pacientes/${patient.id}`}
                    prefetch={false}
                  >
                    Ver paciente
                  </Link>
                </div>
              ))}
            </div>
            {summary.recentPatients.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                <p className="font-semibold text-ink">
                  Todavía no hay pacientes cargados.
                </p>
              </div>
            ) : null}
          </section>
      </PageContainer>
    </main>
  );
}
