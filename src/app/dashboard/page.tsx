"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  CreditCard,
  DollarSign,
  Search,
  UsersRound,
} from "lucide-react";
import { PendingClinicInvitationsBanner } from "@/components/dashboard/PendingClinicInvitationsBanner";
import { PendingReceptionInvitationsBanner } from "@/components/dashboard/PendingReceptionInvitationsBanner";
import { TodayAgendaCard } from "@/components/dashboard/TodayAgendaCard";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/format";
import { getPlanDisplayName, getTrialCountdownLabel } from "@/lib/plans";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";
import { useDashboardSummary } from "@/hooks/useDashboardSummary";
import { usePendingClinicInvitations } from "@/hooks/usePendingClinicInvitations";
import { isRecepcionWorkspace } from "@/lib/workspace-permissions";

export default function DashboardPage() {
  const { accountType, authError, displayName, loading, redirecting, user } =
    useRequireAuth();
  const {
    activeWorkspace,
    loaded: workspaceLoaded,
    refreshWorkspaces,
  } = useActiveWorkspace();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const {
    accessLevel,
    isReadOnly,
    loaded: accessLoaded,
    trialDaysRemaining,
  } = useAccessLevel();
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
    !accessLoaded ||
    !planLoaded ||
    !workspaceLoaded
  ) {
    return <DashboardLoading />;
  }

  const currentPlanName = getPlanDisplayName(plan.plan);
  const isClinicWorkspace = activeWorkspace?.type === "CLINICA";
  // Recepción no ve Ingresos ni Plan, ni crea evoluciones: se ocultan esos
  // accesos.
  const isRecepcion = isRecepcionWorkspace(activeWorkspace);
  const effectiveAccountType = isClinicWorkspace ? "CONSULTORIO" : accountType;
  const patientLimitBlock = isClinicWorkspace
    ? null
    : accessLevel === "TRIAL_ACTIVE"
      ? null
      : getPatientPlanLimitBlock({
        activePatientCount: summary.activePatientCount,
        patientLimit: plan.limitePacientes,
      });
  const readOnlyMessage =
    "Tu período de prueba gratuita venció. Activá un plan para seguir gestionando pacientes.";
  const writeBlockMessage = isReadOnly ? readOnlyMessage : patientLimitBlock;
  const dashboardTitle = isClinicWorkspace
    ? `Panel de ${activeWorkspace.name}`
    : `Hola, ${displayName}`;
  const dashboardDescription = isRecepcion
    ? "Pacientes, agenda y asistencia de la clínica en un solo lugar."
    : isClinicWorkspace
    ? "Equipo, pacientes, agenda e ingresos de la clínica en un solo lugar."
    : "Pacientes, turnos, evoluciones y cobros en un solo lugar.";
  // Totales reales: las listas del resumen vienen limitadas.
  const actionRequiredCount = summary.actionRequiredCount;
  const pendingPaymentCount = summary.pendingPaymentCount;
  // Mismas reglas que el menú para ver Ingresos.
  const canSeeIncome = !(
    isRecepcion ||
    (effectiveAccountType === "KINESIOLOGO" &&
      plan.plan !== "INDEPENDIENTE" &&
      accessLevel !== "TRIAL_ACTIVE")
  );
  const quickAccessItems = [
    {
      label: "Nuevo paciente",
      href: "/dashboard/pacientes?nuevo=1",
      icon: UsersRound,
    },
    ...(!canSeeIncome
      ? []
      : [
          {
            label: "Ver ingresos",
            href: "/dashboard/ingresos",
            icon: DollarSign,
          },
        ]),
  ];

  const summaryCards = [
    {
      label: "Pacientes activos",
      value: String(summary.activePatientCount),
      detail:
        summary.activePatientCount === 0 ? "Sin pacientes cargados" : "En seguimiento",
    },
    // Los cobros pendientes ya están en "Requieren acción"; acá va lo cobrado.
    ...(canSeeIncome
      ? [
          {
            label: "Cobrado este mes",
            value: formatCurrency(summary.monthIncome),
            detail:
              pendingPaymentCount > 0
                ? `${pendingPaymentCount} ${
                    pendingPaymentCount === 1
                      ? "cobro pendiente"
                      : "cobros pendientes"
                  }`
                : "Todo al día",
          },
        ]
      : []),
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
              {writeBlockMessage ? (
                <button
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-500"
                  disabled
                  title={writeBlockMessage}
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
            eyebrow="Inicio"
            title={dashboardTitle}
          />

          {/* Una cuenta de recepción no recibe invitaciones: la crea la clínica. */}
          {accountType === "RECEPCION" ? null : (
            <>
              <PendingClinicInvitationsBanner
                actionError={invitationActionError}
                invitations={pendingInvitations}
                notice={invitationNotice}
                onAccept={handleAcceptInvitation}
                onReject={rejectInvitation}
              />

              <PendingReceptionInvitationsBanner />
            </>
          )}

          {!isRecepcion && accessLevel === "TRIAL_ACTIVE" ? (
            <Card
              variant={
                trialDaysRemaining !== null && trialDaysRemaining <= 7
                  ? "warning"
                  : "default"
              }
              padding="md"
              className="mt-4 flex flex-col justify-between gap-4 sm:mt-6 md:flex-row md:items-center"
            >
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                  <CreditCard className="h-5 w-5" />
                </span>
                <div>
                  <p
                    className={`font-bold ${
                      trialDaysRemaining !== null && trialDaysRemaining <= 7
                        ? "text-amber-900"
                        : "text-ink"
                    }`}
                  >
                    Prueba gratuita ·{" "}
                    {getTrialCountdownLabel(trialDaysRemaining) ??
                      "3 meses incluidos"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {trialDaysRemaining !== null && trialDaysRemaining <= 7
                      ? "Se termina pronto. Activá un plan para no perder acceso a tus pacientes."
                      : "Sin tarjeta y sin compromiso. Activá un plan cuando quieras."}
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/dashboard/planes"
              >
                Activar plan
              </Link>
            </Card>
          ) : null}

          {isRecepcion ? null : isReadOnly ? (
            <Card
              as="section"
              variant="danger"
              className="mt-4 text-sm font-semibold text-rose-800 sm:mt-6"
            >
              <p>{readOnlyMessage}</p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Activar plan
              </Link>
            </Card>
          ) : patientLimitBlock ? (
            <Card
              as="section"
              variant="warning"
              className="mt-4 text-sm font-semibold text-amber-800 sm:mt-6"
            >
              <p>{patientLimitBlock}</p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Reactivar plan
              </Link>
            </Card>
          ) : null}

          {dashboardError ? (
            <Card
              as="section"
              variant="danger"
              className="mt-4 text-sm font-semibold text-rose-700 sm:mt-6"
            >
              <p>{dashboardError}</p>
            </Card>
          ) : null}

          {!isRecepcion && plan.plan !== "FREE" ? (
            <Card
              variant="success"
              padding="md"
              className="mt-4 flex flex-col justify-between gap-4 sm:mt-6 md:flex-row md:items-center"
            >
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
                      : "Estado: pendiente de confirmación de Mercado Pago."}
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
                href="/dashboard/planes"
              >
                Ver mi plan
              </Link>
            </Card>
          ) : null}

          <section
            className={`mt-4 grid gap-3 sm:mt-6 ${
              summaryCards.length > 1 ? "grid-cols-2" : "grid-cols-1"
            }`}
          >
            {summaryCards.map((card) => (
              <Card as="article" variant="default" padding="sm" key={card.label}>
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-ink">
                  {card.value}
                </p>
                <p className="mt-3 text-sm font-medium text-ocean-700">
                  {card.detail}
                </p>
              </Card>
            ))}
          </section>

          <section className="mt-4 grid items-start gap-4 xl:grid-cols-[1.6fr_0.8fr] sm:mt-6 sm:gap-6">
            <TodayAgendaCard readOnlyMessage={isReadOnly ? readOnlyMessage : null} />

            <div className="space-y-6">
              <Card variant="default" padding="md">
                <h2 className="text-lg font-bold text-ink">Requieren acción</h2>
                <div className="mt-4 space-y-3">
                  {actionRequiredCount > 0 ? (
                    <Link
                      className="block rounded-lg border border-amber-100 bg-amber-50 p-3 transition hover:bg-amber-100"
                      href="/dashboard/turnos"
                    >
                      <p className="text-sm font-semibold text-amber-800">
                        {actionRequiredCount}{" "}
                        {actionRequiredCount === 1
                          ? "turno sin registrar asistencia"
                          : "turnos sin registrar asistencia"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-700">
                        Revisar
                      </p>
                    </Link>
                  ) : null}
                  {pendingPaymentCount > 0 ? (
                    <Link
                      className="block rounded-lg border border-amber-100 bg-amber-50 p-3 transition hover:bg-amber-100"
                      href={isRecepcion ? "/dashboard/turnos" : "/dashboard/ingresos"}
                    >
                      <p className="text-sm font-semibold text-amber-800">
                        {pendingPaymentCount}{" "}
                        {pendingPaymentCount === 1
                          ? "cobro pendiente"
                          : "cobros pendientes"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-700">
                        Revisar
                      </p>
                    </Link>
                  ) : null}                </div>
                {actionRequiredCount === 0 &&
                pendingPaymentCount === 0 ? (
                  <p className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm text-slate-600">
                    No hay alertas pendientes.
                  </p>
                ) : null}
              </Card>

              <Card variant="default" padding="md">
                <h2 className="text-lg font-bold text-ink">Accesos rápidos</h2>
                <div className="mt-4 grid gap-2">
                  {quickAccessItems.map((item) => {
                    const Icon = item.icon;
                    const blockedByWriteAccess =
                      Boolean(writeBlockMessage) &&
                      (item.href === "/dashboard/pacientes?nuevo=1" ||
                        item.href === "/dashboard/turnos/nuevo" ||
                        item.href === "/dashboard/pacientes");

                    if (blockedByWriteAccess) {
                      return (
                        <button
                          className="flex min-h-11 cursor-not-allowed items-center justify-between rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-400"
                          disabled
                          key={item.label}
                          title={writeBlockMessage ?? undefined}
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
              </Card>
            </div>
          </section>
      </PageContainer>
    </main>
  );
}
