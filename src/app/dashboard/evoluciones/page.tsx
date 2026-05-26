"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, UsersRound } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function EvolutionsPage() {
  const { authError, loading, redirecting } = useRequireAuth();

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

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">Evoluciones</p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Historial por paciente
            </h1>
            <p className="mt-2 text-slate-600">
              Las evoluciones se consultan dentro del historial de cada paciente
              para evitar listados mezclados.
            </p>
          </header>

          <section className="mt-6 grid gap-5 md:grid-cols-2">
            <Link
              className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm transition hover:border-ocean-200 hover:bg-ocean-50"
              href="/dashboard/pacientes"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ocean-100 text-ocean-700">
                <UsersRound className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-ink">
                Ver pacientes
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Ingresá a un paciente para revisar sus turnos, evoluciones y
                notas clínicas.
              </p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-ocean-700">
                Ir a pacientes
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <div className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ocean-100 text-ocean-700">
                <ClipboardList className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-lg font-bold text-ink">
                Registro clínico contextual
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Desde el detalle del paciente podés agregar nuevas evoluciones
                obligatoriamente asociadas a ese paciente.
              </p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
