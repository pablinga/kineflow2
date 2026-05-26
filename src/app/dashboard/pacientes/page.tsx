"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Mail, Phone, Plus, Search, UserRound } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { patients } from "@/lib/mock-data";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function PatientsPage() {
  const { loading } = useRequireAuth();
  const [query, setQuery] = useState("");

  const filteredPatients = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return patients;
    }

    return patients.filter((patient) =>
      [
        patient.name,
        patient.document,
        patient.condition,
        patient.email,
        patient.phone,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

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
              <p className="text-sm font-semibold text-ocean-700">Pacientes</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Gestión de pacientes
              </h1>
              <p className="mt-2 text-slate-600">
                Buscá, revisá datos clínicos y accedé rápido al seguimiento.
              </p>
            </div>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
              type="button"
            >
              <Plus className="h-4 w-4" />
              Nuevo paciente
            </button>
          </header>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <label className="flex items-center gap-3 rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 focus-within:border-ocean-400">
              <Search className="h-5 w-5 text-ocean-600" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, DNI, patología, email o teléfono"
                type="search"
                value={query}
              />
            </label>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {filteredPatients.map((patient) => (
                <article
                  className="rounded-lg border border-ocean-100 bg-white p-5"
                  key={patient.id}
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ocean-100 font-bold text-ocean-800">
                        {patient.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </div>
                      <div>
                        <h2 className="font-bold text-ink">{patient.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                          DNI {patient.document} · {patient.condition}
                        </p>
                        <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                          {patient.status}
                        </span>
                      </div>
                    </div>
                    <Link
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                      href="/dashboard/turnos/nuevo"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      Turno
                    </Link>
                  </div>

                  <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-ocean-600" />
                      {patient.phone}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-ocean-600" />
                      {patient.email}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-ocean-50 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Evolución
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-800">
                        {patient.progress}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ocean-50 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Última sesión
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-800">
                        {patient.lastSession}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ocean-50 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">
                        Próximo turno
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ocean-800">
                        {patient.nextAppointment}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {filteredPatients.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-8 text-center">
                <UserRound className="mx-auto h-8 w-8 text-ocean-600" />
                <p className="mt-3 font-semibold text-ink">
                  No encontramos pacientes con esa búsqueda.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
