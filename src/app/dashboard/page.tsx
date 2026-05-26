import {
  ArrowUpRight,
  CalendarPlus,
  ClipboardPlus,
  FileText,
  Search,
  UsersRound,
} from "lucide-react";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Button } from "@/components/ui/Button";

const summaryCards = [
  { label: "Pacientes activos", value: "42", detail: "+6 este mes" },
  { label: "Sesiones esta semana", value: "28", detail: "82% completadas" },
  { label: "Turnos pendientes", value: "12", detail: "4 para confirmar" },
  { label: "Altas recientes", value: "5", detail: "últimos 30 días" },
];

const appointments = [
  {
    time: "09:00",
    patient: "Marina Duarte",
    reason: "Rehabilitación de rodilla",
  },
  {
    time: "10:30",
    patient: "Laura Méndez",
    reason: "Cervicalgia",
  },
  {
    time: "12:00",
    patient: "Tomás Pereyra",
    reason: "Control postural",
  },
];

const patients = [
  {
    name: "Agustín Franco",
    condition: "Lumbalgia",
    progress: "Mejora funcional 68%",
  },
  {
    name: "Camila Ríos",
    condition: "Esguince de tobillo",
    progress: "Fase de fortalecimiento",
  },
  {
    name: "Pablo Torres",
    condition: "Hombro congelado",
    progress: "Movilidad en progreso",
  },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">
                Dashboard
              </p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Bienvenida, Sofía
              </h1>
              <p className="mt-2 text-slate-600">
                Tenés 8 sesiones programadas para hoy y 4 evoluciones por revisar.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="secondary">
                <Search className="h-4 w-4" />
                Buscar paciente
              </Button>
              <Button>
                <CalendarPlus className="h-4 w-4" />
                Nuevo turno
              </Button>
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
                    icon: UsersRound,
                  },
                  {
                    label: "Registrar evolución",
                    icon: ClipboardPlus,
                  },
                  {
                    label: "Crear informe",
                    icon: FileText,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      className="flex min-h-14 items-center justify-between rounded-lg border border-ocean-100 px-4 text-left font-semibold text-slate-700 transition hover:border-ocean-200 hover:bg-ocean-50"
                      key={item.label}
                      type="button"
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-ocean-600" />
                        {item.label}
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-slate-400" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold text-ink">Próximos turnos</h2>
                <button
                  className="text-sm font-semibold text-ocean-700"
                  type="button"
                >
                  Ver agenda
                </button>
              </div>
              <div className="mt-5 divide-y divide-ocean-100">
                {appointments.map((appointment) => (
                  <div
                    className="grid gap-3 py-4 sm:grid-cols-[5rem_1fr_auto] sm:items-center"
                    key={`${appointment.time}-${appointment.patient}`}
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
                    <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      Confirmado
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-ink">Pacientes recientes</h2>
              <button
                className="text-sm font-semibold text-ocean-700"
                type="button"
              >
                Ver pacientes
              </button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {patients.map((patient) => (
                <article
                  className="rounded-lg border border-ocean-100 bg-white p-4"
                  key={patient.name}
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
          </section>
        </div>
      </section>
    </main>
  );
}
