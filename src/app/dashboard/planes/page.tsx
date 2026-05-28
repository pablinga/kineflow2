"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { isPlanAllowedForAccount } from "@/lib/billing";
import { plans, type CommercialPlan } from "@/lib/plans";

const MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL =
  "https://www.mercadopago.com.ar/subscriptions/checkout";

export default function PlansPage() {
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { loaded: patientsLoaded, patients } = usePatients();
  const [selectedPlan, setSelectedPlan] = useState<CommercialPlan | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState("");

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesión activá. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !planLoaded || !patientsLoaded) {
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
  const hasPaidPlan = plan.plan !== "FREE";

  function handleCheckout(planId: CommercialPlan) {
    setSelectedPlan(planId);
    setCheckoutError("");
    setCheckoutMessage("");

    if (planId === plan.plan) {
      return;
    }

    if (planId === "FREE") {
      setCheckoutMessage("Ya podés empezar gratis desde tu cuenta actual.");
      return;
    }

    setCheckoutLoading(planId);

    try {
      if (planId !== "INDEPENDIENTE") {
        throw new Error("Este plan todavia no tiene checkout configurado.");
      }

      const preapprovalPlanId =
        process.env.NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID?.trim();

      if (!preapprovalPlanId) {
        throw new Error(
          "Falta configurar NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID.",
        );
      }

      const initPoint = new URL(MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL);
      initPoint.searchParams.set("preapproval_plan_id", preapprovalPlanId);

      window.location.href = initPoint.toString();
      return;

    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "No pudimos iniciar el flujo de upgrade.",
      );
    } finally {
      setCheckoutLoading("");
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">Planes</p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Activár o mejorar plan
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Actualmente estás usando el Plan {plan.plan}. Revisá qué incluye
              cada opción y activá un plan pago cuando necesites gestionar una
              práctica propia o un consultorio.
            </p>
          </header>

          {hasPaidPlan ? (
            <section className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
              <p className="font-bold text-emerald-900">
                {plan.estadoPlan === "ACTIVO"
                  ? `Plan activo: ${plan.plan}`
                  : `Plan actual: ${plan.plan}`}
              </p>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                {plan.estadoPlan === "ACTIVO"
                  ? "Tu suscripcion esta activa."
                  : "Estado: pendiente de confirmacion de Mercado Pago."}
              </p>
            </section>
          ) : null}

          <section className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              ["Plan actual", plan.plan],
              ["Estado", plan.estadoPlan],
              [
                "Límite de pacientes",
                plan.limitePacientes === null || plan.limitePacientes < 0
                  ? "Ilimitado"
                  : String(plan.limitePacientes),
              ],
              ["Pacientes usados", String(activePatients.length)],
            ].map(([label, value]) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-4 shadow-sm"
                key={label}
              >
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-xl font-bold text-ink">{value}</p>
              </article>
            ))}
          </section>

          {reachedFreeLimit ? (
            <section className="mt-6 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              Llegaste al límite de 5 pacientes del Plan Free. Para cargar
              nuevos pacientes propios, activá el Plan Independiente.
            </section>
          ) : null}

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="font-bold text-ink">
              Kinesiólogos que trabajan solo para consultorios
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Si sos kinesiólogo y trabajás únicamente para consultorios, no
              necesitás contratar el Plan Independiente. Podés usar KineFlow
              para ver tus turnos y cargar evoluciónes de los consultorios donde
              estés vinculado. Solo necesitás el Plan Independiente si querés
              gestionar tus propios pacientes particulares.
            </p>
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-3">
            {visiblePlans.map((item) => {
              const Icon = item.icon;
              const isCurrent = item.id === plan.plan;

              return (
                <article
                  className={`relative flex rounded-lg border bg-white p-6 shadow-sm ${
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
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h2
                      className={`mt-5 text-xl font-bold text-ink ${
                        item.recommended ? "pr-28" : ""
                      }`}
                    >
                      {item.name}
                    </h2>
                    <p className="mt-2 text-3xl font-bold text-ocean-800">
                      {item.price}
                    </p>
                    <p className="mt-2 font-semibold text-slate-700">
                      {item.limit}
                    </p>
                    <p className="mt-3 leading-7 text-slate-600">
                      {item.audience}
                    </p>
                    <ul className="mt-5 space-y-3">
                      {item.features.map((feature) => (
                        <li
                          className="flex gap-3 text-sm leading-6 text-slate-700"
                          key={feature}
                        >
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
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
                    {item.id.startsWith("CONSULTORIO_") ? (
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Cada consultorio paga por los kinesiólogos activos
                        dentro de su propia cuenta, incluso si el profesional
                        trabaja en otros consultorios.
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>

          {selectedPlan ? (
            <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold text-ink">
                      Activáción próximamente
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {checkoutError ||
                        checkoutMessage ||
                        `La selección del plan ${
                          plans.find((item) => item.id === selectedPlan)?.name
                        } queda lista para conectar con Mercado Pago.`}
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
        </div>
      </section>
    </main>
  );
}
