"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { isPlanAllowedForAccount } from "@/lib/billing";
import { getFriendlyErrorMessage, logFriendlyError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { getPlanDisplayName, plans, type CommercialPlan } from "@/lib/plans";

export default function PlansPage() {
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { loaded: patientsLoaded, patients } = usePatients();
  const [selectedPlan, setSelectedPlan] = useState<CommercialPlan | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState("");
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelReference, setCancelReference] = useState("");

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesion activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !planLoaded || !patientsLoaded || !workspaceLoaded) {
    return <DashboardLoading />;
  }

  const activePatients = patients.filter(
    (patient) => patient.status === "Activo",
  );
  const reachedFreeLimit =
    accountType === "KINESIOLOGO" &&
    plan.plan === "FREE" &&
    plan.limitePacientes !== null &&
    activePatients.length >= plan.limitePacientes;
  const visiblePlans = plans.filter((item) =>
    isPlanAllowedForAccount(item.id, accountType),
  );
  const currentPlanName = getPlanDisplayName(plan.plan);
  const patientLimitLabel =
    plan.limitePacientes === null || plan.limitePacientes < 0
      ? "Ilimitado"
      : `${activePatients.length} de ${plan.limitePacientes} pacientes`;
  const subscriptionStatus = plan.estadoPlan ?? "SIN SUSCRIPCIÓN";
  const isFreePlan = plan.plan === "FREE";
  const canCancelSubscription =
    plan.plan === "INDEPENDIENTE" &&
    plan.estadoPlan === "ACTIVO" &&
    !cancelReference;

  async function handleCheckout(planId: CommercialPlan) {
    setSelectedPlan(planId);
    setCheckoutError("");
    setCheckoutMessage(
      `Te estamos llevando a Mercado Pago para activar ${getPlanDisplayName(planId)}.`,
    );

    if (planId === plan.plan) {
      setCheckoutMessage("");
      return;
    }

    if (planId === "FREE") {
      setCheckoutMessage("Ya podes empezar gratis desde tu cuenta actual.");
      return;
    }

    setCheckoutLoading(planId);

    try {
      if (planId !== "INDEPENDIENTE" && planId !== "CONSULTORIO") {
        throw new Error("Este plan todavia no tiene checkout configurado.");
      }

      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error("Necesitas iniciar sesion para activar un plan.");
      }

      const response = await fetch("/api/billing/create-subscription", {
        body: JSON.stringify({
          planId,
          workspaceId: activeWorkspace?.id ?? null,
        }),
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          getFriendlyErrorMessage(result.error, "No pudimos iniciar el checkout."),
        );
      }

      window.location.href = result.initPoint;
      return;
    } catch (error) {
      logFriendlyError("planes.checkout", error);
      setCheckoutError(
        getFriendlyErrorMessage(
          error,
          "No pudimos iniciar el flujo de upgrade.",
        ),
      );
      setCheckoutMessage("");
    } finally {
      setCheckoutLoading("");
    }
  }

  async function handleCancelSubscription() {
    setCancelLoading(true);
    setCheckoutError("");

    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error("Necesitas iniciar sesion para solicitar la baja.");
      }

      const response = await fetch("/api/subscriptions/cancel", {
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          getFriendlyErrorMessage(result.error, "No pudimos cancelar la suscripción."),
        );
      }

      setCancelReference(result.cancellationReference ?? "baja-registrada");
      setCancelModalOpen(false);
    } catch (error) {
      logFriendlyError("planes.cancel", error);
      setCheckoutError(
        getFriendlyErrorMessage(error, "No pudimos cancelar la suscripción."),
      );
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer>
          <PageHeader
            description={
              <>
                Actualmente estás usando {currentPlanName}. Para gestionar tu
                práctica profesional sin límites de pacientes, activá KineFlow -
                Particular.
              </>
            }
            eyebrow="Plan"
            title="Plan / Suscripción"
          />

          <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:mt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold text-ink">
                    {currentPlanName}
                  </h2>
                  <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-bold uppercase text-ocean-800">
                    {subscriptionStatus}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Límite de pacientes:{" "}
                  <span className="font-semibold text-ink">
                    {patientLimitLabel}
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Estado de suscripción:{" "}
                  <span className="font-semibold text-ink">
                    {subscriptionStatus}
                  </span>
                </p>
                {isFreePlan ? (
                  <p className="mt-3 text-sm font-medium text-amber-700">
                    Estás en Plan Free: podés trabajar con hasta 5 pacientes.
                  </p>
                ) : null}
              </div>
              {isFreePlan ? (
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:opacity-60"
                  disabled={checkoutLoading === "INDEPENDIENTE"}
                  onClick={() => handleCheckout("INDEPENDIENTE")}
                  type="button"
                >
                  {checkoutLoading === "INDEPENDIENTE"
                    ? "Preparando..."
                    : "Mejorar plan"}
                </button>
              ) : null}
            </div>
          </section>

          {canCancelSubscription ? (
            <section className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 sm:mt-6">
              <p className="font-bold text-emerald-900">
                {plan.estadoPlan === "ACTIVO"
                  ? `Plan activo: ${currentPlanName}`
                  : `Plan actual: ${currentPlanName}`}
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                {plan.estadoPlan === "ACTIVO"
                  ? "Tu suscripción está activa."
                  : "Estado: pendiente de confirmacion de Mercado Pago."}
              </p>
              <button
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                onClick={() => setCancelModalOpen(true)}
                type="button"
              >
                Cancelar suscripción
              </button>
            </section>
          ) : null}

          <section className="mt-4 grid gap-3 sm:mt-6 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Plan actual", currentPlanName],
              ["Estado", plan.estadoPlan],
              [
                "Límite de pacientes",
                patientLimitLabel,
              ],
              ["Pacientes usados", `${activePatients.length} activos`],
            ].map(([label, value]) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card"
                key={label}
              >
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-ink">{value}</p>
              </article>
            ))}
          </section>

          {reachedFreeLimit ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6">
              Llegaste al límite de 5 pacientes del Plan Free. Para cargar
              nuevos pacientes, activá KineFlow - Particular.
            </section>
          ) : null}

          {cancelReference ? (
            <section className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 sm:mt-6">
              Baja registrada. Referencia de gestion: {cancelReference}
            </section>
          ) : null}

          <section className="mt-4 grid gap-4 sm:mt-6 lg:grid-cols-2">
            {visiblePlans.map((item) => {
              const Icon = item.icon;
              const isCurrent = item.id === plan.plan;

              return (
                <article
                  className={`relative flex rounded-lg border bg-white p-4 shadow-card sm:p-5 ${
                    item.recommended
                      ? "border-ocean-500 ring-2 ring-ocean-100"
                      : "border-ocean-100"
                  }`}
                  key={item.id}
                >
                  {item.recommended ? (
                    <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-ocean-600 px-3 py-1 text-xs font-bold uppercase text-white">
                      <Star className="h-3.5 w-3.5" />
                      Recomendado
                    </div>
                  ) : null}
                  <div className="flex w-full flex-col">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2
                      className={`mt-5 text-xl font-bold text-ink ${
                        item.recommended ? "pr-28" : ""
                      }`}
                    >
                      {item.name}
                    </h2>
                    <p className="mt-2 text-2xl font-bold text-ocean-800">
                      {item.price}
                    </p>
                    <p className="mt-2 font-semibold text-slate-700">
                      {item.limit}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {item.audience}
                    </p>
                    <ul className="mt-5 space-y-2">
                      {item.features.map((feature) => (
                        <li
                          className="flex gap-2 text-sm leading-6 text-slate-700"
                          key={feature}
                        >
                          <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <button
                      className={`mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
                        isCurrent
                          ? "border border-ocean-200 bg-white text-ocean-800"
                          : "bg-ocean-600 text-white shadow-soft hover:bg-ocean-700"
                      }`}
                      disabled={checkoutLoading === item.id}
                      onClick={() => handleCheckout(item.id)}
                      type="button"
                    >
                      {isCurrent
                        ? "Plan actual"
                        : checkoutLoading === item.id
                          ? "Preparando..."
                          : item.cta}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 text-xs text-slate-500 sm:mt-8">
            <LegalLinks />
          </section>

          {selectedPlan && (checkoutError || checkoutMessage) ? (
            <section className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:mt-6 sm:p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold text-ink">Estado del checkout</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {checkoutError || checkoutMessage}
                    </p>
                  </div>
                </div>
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 bg-white px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  onClick={() => setSelectedPlan(null)}
                  type="button"
                >
                  Entendido
                </button>
              </div>
            </section>
          ) : null}
      </PageContainer>
      {cancelModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/70 px-3 pb-3 sm:items-center sm:justify-center sm:px-4 sm:pb-0">
          <section className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-lg sm:p-6">
            <h2 className="text-xl font-bold text-ink">Cancelar suscripción</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Vamos a solicitar la baja de KineFlow - Particular en Mercado Pago y
              registrar la gestion en KineFlow. Vas a recibir una referencia de
              baja al finalizar.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 bg-white px-5 text-sm font-semibold text-ocean-800"
                onClick={() => setCancelModalOpen(false)}
                type="button"
              >
                Volver
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-60"
                disabled={cancelLoading}
                onClick={handleCancelSubscription}
                type="button"
              >
                {cancelLoading ? "Cancelando..." : "Confirmar baja"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
