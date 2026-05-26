"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Star } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { plans, type CommercialPlan } from "@/lib/plans";

export default function PlansPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const [selectedPlan, setSelectedPlan] = useState<CommercialPlan | null>(null);

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

  if (loading || !planLoaded) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">Planes</p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Activar o mejorar plan
            </h1>
            <p className="mt-2 max-w-3xl text-slate-600">
              Actualmente estas usando el Plan {plan.plan}. El flujo de pago
              queda preparado para una futura integracion; por ahora la
              seleccion queda en estado proximamente.
            </p>
          </header>

          <section className="mt-6 grid gap-5 lg:grid-cols-3">
            {plans.map((item) => {
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
                      onClick={() => setSelectedPlan(item.id)}
                      type="button"
                    >
                      {isCurrent ? "Plan actual" : item.cta}
                    </button>
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
                    <p className="font-bold text-ink">Activacion proximamente</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      La seleccion del plan{" "}
                      {plans.find((item) => item.id === selectedPlan)?.name} ya
                      queda lista para conectar con Mercado Pago o el proveedor
                      de pagos que se defina.
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
