"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { isPlanAllowedForAccount } from "@/lib/billing";
import { getSupabaseClient } from "@/lib/supabase";
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
  const [acceptedRecurring, setAcceptedRecurring] = useState(false);
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

  async function handleCheckout(planId: CommercialPlan) {
    setSelectedPlan(planId);
    setCheckoutError("");
    setCheckoutMessage("");

    if (planId === plan.plan) {
      return;
    }

    if (planId === "FREE") {
      setCheckoutMessage("Ya podes empezar gratis desde tu cuenta actual.");
      return;
    }

    if (!acceptedRecurring) {
      setCheckoutError(
        "Necesitas aceptar que el Plan Independiente es una suscripcion recurrente gestionada mediante Mercado Pago.",
      );
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

      const supabase = getSupabaseClient();
      const { data } = await supabase.auth.getUser();
      const initPoint = new URL(MERCADOPAGO_SUBSCRIPTIONS_CHECKOUT_URL);
      initPoint.searchParams.set("preapproval_plan_id", preapprovalPlanId);
      initPoint.searchParams.set(
        "back_url",
        `${window.location.origin}/app/suscripcion/confirmacion`,
      );

      if (data.user?.id) {
        initPoint.searchParams.set(
          "external_reference",
          `${data.user.id}:INDEPENDIENTE:${crypto.randomUUID()}`,
        );
      }

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

      const response = await fetch("/api/billing/cancel-subscription", {
        headers: { Authorization: `Bearer ${accessToken}` },
        method: "POST",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No pudimos cancelar la suscripcion.");
      }

      setCancelReference(result.cancellationReference ?? "baja-registrada");
      setCancelModalOpen(false);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "No pudimos cancelar la suscripcion.",
      );
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="border-b border-ocean-100 bg-white/70 pb-5">
            <p className="text-sm font-semibold text-ocean-700">Plan</p>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
              Plan / Suscripcion
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              Actualmente estas usando el Plan {plan.plan}. Para gestionar tu
              practica independiente sin limites de pacientes, activa el Plan
              Independiente.
            </p>
          </header>

          {hasPaidPlan ? (
            <section className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
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
              <button
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                onClick={() => setCancelModalOpen(true)}
                type="button"
              >
                Cancelar suscripcion
              </button>
            </section>
          ) : null}

          <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Plan actual", plan.plan],
              ["Estado", plan.estadoPlan],
              [
                "Limite de pacientes",
                plan.limitePacientes === null || plan.limitePacientes < 0
                  ? "Ilimitado"
                  : String(plan.limitePacientes),
              ],
              ["Pacientes usados", String(activePatients.length)],
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
            <section className="mt-6 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              Llegaste al limite de 5 pacientes del Plan Free. Para cargar
              nuevos pacientes, activa el Plan Independiente.
            </section>
          ) : null}

          {cancelReference ? (
            <section className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
              Baja registrada. Referencia de gestion: {cancelReference}
            </section>
          ) : null}

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-4">
            <label className="flex items-start gap-3 text-sm leading-6 text-slate-600">
              <input
                checked={acceptedRecurring}
                className="mt-1 h-4 w-4 accent-ocean-600"
                onChange={(event) => setAcceptedRecurring(event.target.checked)}
                type="checkbox"
              />
              <span>
                Entiendo que el Plan Independiente es una suscripcion recurrente
                gestionada mediante Mercado Pago y que puedo solicitar la baja
                desde KineFlow.
              </span>
            </label>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {visiblePlans.map((item) => {
              const Icon = item.icon;
              const isCurrent = item.id === plan.plan;

              return (
                <article
                  className={`relative flex rounded-lg border bg-white p-5 shadow-card ${
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

          <section className="mt-8 rounded-lg border border-ocean-100 bg-white p-4 text-xs text-slate-500">
            <LegalLinks />
          </section>

          {selectedPlan ? (
            <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <Clock className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-bold text-ink">Estado del checkout</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {checkoutError ||
                        checkoutMessage ||
                        `La seleccion del plan ${
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
      {cancelModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4">
          <section className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-ink">Cancelar suscripcion</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Vamos a solicitar la baja del Plan Independiente en Mercado Pago y
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
