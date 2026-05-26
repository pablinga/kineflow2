"use client";

import { useState } from "react";
import { Activity, ClipboardPlus, Save } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { usePatients } from "@/hooks/usePatients";
import { evolutions } from "@/lib/mock-data";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function EvolutionsPage() {
  const { loading } = useRequireAuth();
  const { activePatients, loaded } = usePatients();
  const [saved, setSaved] = useState(false);

  if (loading || !loaded) {
    return <DashboardLoading />;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(true);
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">Evoluciones</p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Seguimiento de sesiones
            </h1>
            <p className="mt-2 text-slate-600">
              Registrá notas clínicas, dolor, movilidad y avances por paciente.
            </p>
          </header>

          <section className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <form
              className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
              onSubmit={handleSubmit}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-100 text-ocean-700">
                  <ClipboardPlus className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-ink">Nueva evolución</h2>
                  <p className="text-sm text-slate-500">Datos mockeados por ahora.</p>
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Paciente
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    required
                  >
                    <option value="">Seleccionar paciente</option>
                    {activePatients.map((patient) => (
                      <option key={patient.id} value={patient.id}>
                        {patient.name}
                      </option>
                    ))}
                  </select>
                  {activePatients.length === 0 ? (
                    <p className="mt-2 text-sm text-amber-700">
                      Primero cargá un paciente activo para registrar una evolución.
                    </p>
                  ) : null}
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">Fecha</span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    required
                    type="date"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Dolor
                  </span>
                  <select className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400">
                    {["0/10", "1/10", "2/10", "3/10", "4/10", "5/10", "6/10"].map(
                      (value) => (
                        <option key={value}>{value}</option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">
                  Movilidad / fuerza
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  placeholder="Ej. Mejora de rango en flexión"
                  required
                  type="text"
                />
              </label>
              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">
                  Notas clínicas
                </span>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                  placeholder="Resumen de la sesión, respuesta al tratamiento y próximos objetivos"
                  required
                />
              </label>

              {saved ? (
                <p className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                  Evolución preparada en pantalla. Falta persistirla en Supabase.
                </p>
              ) : null}

              <button
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={activePatients.length === 0}
                type="submit"
              >
                <Save className="h-4 w-4" />
                Guardar evolución
              </button>
            </form>

            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-ink">Historial reciente</h2>
              <div className="mt-5 space-y-4">
                {evolutions.map((evolution) => (
                  <article
                    className="rounded-lg border border-ocean-100 p-4"
                    key={evolution.id}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <h3 className="font-bold text-ink">{evolution.patient}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {evolution.date} · {evolution.diagnosis}
                        </p>
                      </div>
                      <span className="flex w-fit items-center gap-2 rounded-full bg-ocean-50 px-3 py-1 text-sm font-semibold text-ocean-800">
                        <Activity className="h-4 w-4" />
                        Dolor {evolution.pain}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-ocean-800">
                      {evolution.mobility}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {evolution.notes}
                    </p>
                  </article>
                ))}
              </div>
              {evolutions.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-8 text-center">
                  <p className="font-semibold text-ink">
                    Sin evoluciones registradas.
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Cuando guardemos evoluciones reales, aparecerán en este historial.
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
