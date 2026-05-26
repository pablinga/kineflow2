"use client";

import Link from "next/link";
import { CalendarPlus, Clock, MapPin } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { appointments } from "@/lib/mock-data";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function AppointmentsPage() {
  const { loading } = useRequireAuth();

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Turnos</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">Agenda</h1>
              <p className="mt-2 text-slate-600">
                Revisá los próximos turnos y su estado de confirmación.
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
              href="/dashboard/turnos/nuevo"
            >
              <CalendarPlus className="h-4 w-4" />
              Nuevo turno
            </Link>
          </header>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <div className="grid gap-4">
              {appointments.map((appointment) => (
                <article
                  className="grid gap-4 rounded-lg border border-ocean-100 p-5 md:grid-cols-[7rem_1fr_auto] md:items-center"
                  key={appointment.id}
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-500">
                      {appointment.date}
                    </p>
                    <p className="mt-1 text-2xl font-bold text-ocean-800">
                      {appointment.time}
                    </p>
                  </div>
                  <div>
                    <h2 className="font-bold text-ink">{appointment.patient}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {appointment.reason}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-ocean-600" />
                        {appointment.duration}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-4 w-4 text-ocean-600" />
                        {appointment.modality}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`w-fit rounded-full px-3 py-1 text-sm font-semibold ${
                      appointment.status === "Confirmado"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {appointment.status}
                  </span>
                </article>
              ))}
            </div>
            {appointments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-8 text-center">
                <p className="font-semibold text-ink">Sin turnos cargados.</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Creá pacientes y luego programá sus sesiones desde Nuevo turno.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
