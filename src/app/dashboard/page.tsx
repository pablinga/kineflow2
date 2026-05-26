"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarPlus,
  ClipboardPlus,
  FileText,
  Search,
  UsersRound,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useAppointments } from "@/hooks/useAppointments";
import { useEvolutions } from "@/hooks/useEvolutions";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";

export default function DashboardPage() {
  const { displayName, loading } = useRequireAuth();
  const {
    activePatients,
    loaded: patientsLoaded,
    patients,
  } = usePatients();
  const { appointments, loaded: appointmentsLoaded } = useAppointments();
  const { evolutions, loaded: evolutionsLoaded } = useEvolutions();

  if (loading || !patientsLoaded || !appointmentsLoaded || !evolutionsLoaded) {
    return <DashboardLoading />;
  }

  const pendingAppointments = appointments.filter(
    (appointment) => appointment.status === "Pendiente",
  );

  const summaryCards = [
    {
      label: "Pacientes activos",
      value: String(activePatients.length),
      detail: patients.length === 0 ? "Sin pacientes cargados" : "En seguimiento",
    },
    {
      label: "Sesiones esta semana",
      value: String(appointments.length),
      detail: appointments.length === 0 ? "Sin sesiones cargadas" : "Turnos registrados",
    },
    {
      label: "Turnos pendientes",
      value: String(pendingAppointments.length),
      detail:
        pendingAppointments.length === 0
          ? "Sin turnos pendientes"
          : "Requieren confirmación",
    },
    { label: "Evoluciones", value: String(evolutions.length), detail: "Historial clínico" },
  ];

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Dashboard</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Bienvenida, {displayName}
              </h1>
              <p className="mt-2 text-slate-600">
                Tu espacio ya guarda pacientes, turnos y evoluciones en Supabase.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-white px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50"
                href="/dashboard/pacientes"
              >
                <Search className="h-4 w-4" />
                Buscar paciente
              </Link>
              <Link
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                href="/dashboard/turnos/nuevo"
              >
                <CalendarPlus className="h-4 w-4" />
                Nuevo turno
              </Link>
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
                key={card.label}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-3 text-3xl font-bold text-ink">
                      {card.value}
                    </p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <ArrowUpRight className="h-5 w-5" />
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ocean-700">
                  {card.detail}
                </p>
              </article>
            ))}
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-ink">Accesos rápidos</h2>
              <div className="mt-5 grid gap-3">
                {[
                  {
                    label: "Nuevo paciente",
                    href: "/dashboard/pacientes",
                    icon: UsersRound,
                  },
                  {
                    label: "Registrar evolución",
                    href: "/dashboard/evoluciones",
                    icon: ClipboardPlus,
                  },
                  {
                    label: "Crear informe",
                    href: "/dashboard/evoluciones",
                    icon: FileText,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      className="flex min-h-14 items-center justify-between rounded-lg border border-ocean-100 px-4 text-left font-semibold text-slate-700 transition hover:border-ocean-200 hover:bg-ocean-50"
                      href={item.href}
                      key={item.label}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-ocean-600" />
                        {item.label}
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-slate-400" />
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-ink">Próximos turnos</h2>
                <Link
                  className="text-sm font-semibold text-ocean-700"
                  href="/dashboard/turnos"
                >
                  Ver agenda
                </Link>
              </div>
              <div className="mt-5 divide-y divide-ocean-100">
                {appointments.slice(0, 3).map((appointment) => (
                  <div
                    className="grid gap-3 py-4 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
                    key={appointment.id}
                  >
                    <span className="w-fit rounded-lg bg-ocean-50 px-3 py-2 text-sm font-bold text-ocean-800">
                      {appointment.time}
                    </span>
                    <div>
                      <p className="font-semibold text-ink">
                        {appointment.patient}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {appointment.reason}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                      {appointment.status}
                    </span>
                  </div>
                ))}
              </div>
              {appointments.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                  <p className="font-semibold text-ink">Sin turnos cargados.</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Los próximos turnos aparecerán cuando programes sesiones.
                  </p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-ink">Pacientes recientes</h2>
                <Link
                  className="text-sm font-semibold text-ocean-700"
                  href="/dashboard/pacientes"
                >
                  Ver pacientes
                </Link>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                {patients.slice(0, 3).map((patient) => (
                  <article
                    className="rounded-lg border border-ocean-100 bg-white p-4"
                    key={patient.id}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-100 font-bold text-ocean-800">
                        {patient.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </div>
                      <div>
                        <p className="font-semibold text-ink">{patient.name}</p>
                        <p className="text-sm text-slate-500">
                          {patient.condition}
                        </p>
                      </div>
                    </div>
                    <p className="mt-4 rounded-lg bg-ocean-50 px-3 py-2 text-sm font-medium text-ocean-800">
                      {patient.progress}
                    </p>
                  </article>
                ))}
              </div>
              {patients.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                  <p className="font-semibold text-ink">
                    Todavía no hay pacientes cargados.
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Creá el primero para iniciar el seguimiento clínico.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-ink">Evoluciones</h2>
                <Link
                  className="text-sm font-semibold text-ocean-700"
                  href="/dashboard/evoluciones"
                >
                  Ver todas
                </Link>
              </div>
              <div className="mt-5 space-y-3">
                {evolutions.slice(0, 2).map((evolution) => (
                  <article
                    className="rounded-lg border border-ocean-100 p-4"
                    key={evolution.id}
                  >
                    <p className="font-semibold text-ink">{evolution.patient}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Dolor {evolution.pain}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {evolution.notes}
                    </p>
                  </article>
                ))}
              </div>
              {evolutions.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
                  <p className="font-semibold text-ink">
                    Sin evoluciones registradas.
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Se van a mostrar cuando empieces a registrar sesiones.
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
