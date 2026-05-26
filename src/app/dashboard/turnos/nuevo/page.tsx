"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, Save } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function NewAppointmentPage() {
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
        <div className="mx-auto max-w-4xl">
          <Link
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ocean-700"
            href="/dashboard/turnos"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a turnos
          </Link>

          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">Nuevo turno</p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Programar una sesión
            </h1>
            <p className="mt-2 text-slate-600">
              Cargá los datos del turno. En la próxima etapa lo guardamos en Supabase.
            </p>
          </header>

          <form
            className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-5 md:grid-cols-2">
              <label className="block">
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
                    Primero cargá un paciente activo para asignarle un turno.
                  </p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Motivo
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  placeholder="Ej. Rehabilitación de rodilla"
                  required
                  type="text"
                />
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
                <span className="text-sm font-semibold text-slate-700">Hora</span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  required
                  type="time"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Duración
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  defaultValue="45 min"
                >
                  <option>30 min</option>
                  <option>45 min</option>
                  <option>60 min</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Modalidad
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  defaultValue="Presencial"
                >
                  <option>Presencial</option>
                  <option>Virtual</option>
                </select>
              </label>
            </div>
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">
                Observaciones
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                placeholder="Notas internas para preparar la sesión"
              />
            </label>

            {saved ? (
              <p className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                Turno preparado en pantalla. Falta conectarlo a la base para persistirlo.
              </p>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                href="/dashboard/turnos"
              >
                Cancelar
              </Link>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={activePatients.length === 0}
              >
                <Save className="h-4 w-4" />
                Guardar turno
              </button>
            </div>
          </form>

          <div className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-100 text-ocean-700">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-ink">Próxima mejora</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Validar disponibilidad horaria y evitar turnos duplicados.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
