"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  Mail,
  Phone,
  Plus,
  Search,
  UserMinus,
  UserRound,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { usePatients, type NewPatientInput } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { canCreatePatient } from "@/lib/billing";

const emptyPatient: NewPatientInput = {
  name: "",
  document: "",
  phone: "",
  email: "",
  condition: "",
};

export default function PatientsPage() {
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const { addPatient, disablePatient, error, loaded, patients } = usePatients();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [newPatient, setNewPatient] = useState<NewPatientInput>(emptyPatient);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

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
        patient.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [patients, query]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("nuevo") === "1") {
      setShowForm(true);
    }
  }, []);

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

  if (loading || !loaded || !planLoaded) {
    return <DashboardLoading />;
  }

  const activePatients = patients.filter(
    (patient) => patient.status === "Activo",
  );
  const clinicPracticeBlocked =
    accountType === "CONSULTORIO" &&
    !(plan.estadoPlan === "ACTIVO" && plan.plan.startsWith("CONSULTORIO_"));
  const canCreateCurrentPatient = canCreatePatient({
    accountType,
    activePatientCount: activePatients.length,
    patientLimit: plan.limitePacientes,
    plan: plan.plan,
    planStatus: plan.estadoPlan,
  });
  const freeLimitReached =
    accountType === "KINESIOLOGO" &&
    plan.plan === "FREE" &&
    plan.limitePacientes !== null &&
    plan.limitePacientes >= 0 &&
    activePatients.length >= plan.limitePacientes;
  const independentPlanMessage =
    "Esta funcionalidad está disponible en el Plan Independiente. Podés activárlo para gestionar tus pacientes, turnos y cobros propios.";

  function updateField(field: keyof NewPatientInput, value: string) {
    setNewPatient((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");

    try {
      if (!canCreateCurrentPatient) {
        setActionError(
          freeLimitReached
            ? "Alcanzaste el límite del plan Free. El plan Free permite cargar hasta 5 pacientes. Para seguir agregando pacientes, activá el Plan Independiente."
            : clinicPracticeBlocked
              ? "Para gestionar pacientes del consultorio necesitás una suscripción activa del Plan Consultorio."
              : independentPlanMessage,
        );
        return;
      }

      await addPatient(newPatient);
      setNewPatient(emptyPatient);
      setShowForm(false);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos guardar el paciente.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDisablePatient(id: string) {
    setActionError("");

    try {
      await disablePatient(id);
    } catch (disableError) {
      setActionError(
        disableError instanceof Error
          ? disableError.message
          : "No pudimos deshabilitar el paciente.",
      );
    }
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
                Carga pacientes, revisa su historial y agenda nuevas sesiónes.
              </p>
            </div>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
              onClick={() => {
                if (!canCreateCurrentPatient) {
                  setActionError(
                    freeLimitReached
                      ? "Alcanzaste el límite del plan Free. El plan Free permite cargar hasta 5 pacientes. Para seguir agregando pacientes, activá el Plan Independiente."
                      : clinicPracticeBlocked
                        ? "Para gestionar pacientes del consultorio necesitás una suscripción activa del Plan Consultorio."
                        : independentPlanMessage,
                  );
                  return;
                }

                setActionError("");
                setShowForm((value) => !value);
              }}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Nuevo paciente
            </button>
          </header>

          {clinicPracticeBlocked ? (
            <section className="mt-6 rounded-lg border border-amber-100 bg-amber-50 p-5 shadow-sm">
              <p className="font-bold text-amber-900">
                Plan Consultorio requerido
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Para gestionar pacientes del consultorio necesitás una
                suscripción activa del Plan Consultorio.
              </p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Ver planes
              </Link>
            </section>
          ) : plan.plan === "FREE" ? (
            <section className="mt-6 rounded-lg border border-ocean-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <p className="font-bold text-ink">
                    Plan Free: {activePatients.length}
                    /{plan.limitePacientes} pacientes activos
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Actualmente estás usando el Plan Free. Activá un plan pago
                    para acceder a pacientes ilimitados y funciones avanzadas.
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700"
                  href="/dashboard/planes"
                >
                  Ver planes
                </Link>
              </div>
            </section>
          ) : null}

          {error || actionError ? (
            <div className="mt-6 rounded-lg border border-red-100 bg-red-50 p-5 text-sm font-medium text-red-700">
              <p className="font-bold">
                {freeLimitReached && actionError
                  ? "Alcanzaste el límite del plan Free"
                  : "No pudimos completar la acción"}
              </p>
              <p className="mt-1">{actionError || error}</p>
              {(actionError || error).includes("Plan Free") ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                  href="/dashboard/planes"
                >
                  Ver planes
                </Link>
              ) : null}
            </div>
          ) : null}

          {showForm ? (
            <form
              className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
              onSubmit={handleSubmit}
            >
              <h2 className="text-lg font-bold text-ink">Nuevo paciente</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Nombre completo
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => updateField("name", event.target.value)}
                    placeholder="Ej. Mariana López"
                    required
                    type="text"
                    value={newPatient.name}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">DNI</span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      updateField("document", event.target.value)
                    }
                    placeholder="Ej. 32.456.789"
                    required
                    type="text"
                    value={newPatient.document}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Teléfono
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => updateField("phone", event.target.value)}
                    placeholder="+54 9 11 5555-5555"
                    required
                    type="tel"
                    value={newPatient.phone}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Email
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => updateField("email", event.target.value)}
                    placeholder="paciente@email.com"
                    required
                    type="email"
                    value={newPatient.email}
                  />
                </label>
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Motivo de consulta / diagnóstico inicial
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      updateField("condition", event.target.value)
                    }
                    placeholder="Ej. Lumbalgia, rehabilitación de rodilla"
                    required
                    type="text"
                    value={newPatient.condition}
                  />
                </label>
              </div>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  onClick={() => setShowForm(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  <Plus className="h-4 w-4" />
                  {saving ? "Guardando..." : "Guardar paciente"}
                </button>
              </div>
            </form>
          ) : null}

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <label className="flex items-center gap-3 rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 focus-within:border-ocean-400">
              <Search className="h-5 w-5 text-ocean-600" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre, DNI, patología, email, teléfono o estado"
                type="search"
                value={query}
              />
            </label>

            {patients.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-8 text-center">
                <UserRound className="mx-auto h-8 w-8 text-ocean-600" />
                <p className="mt-3 font-semibold text-ink">
                  Todavía no hay pacientes cargados.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Creá el primer paciente para empezar a programar turnos y
                  registrar evoluciónes.
                </p>
              </div>
            ) : (
              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {filteredPatients.map((patient) => (
                  <article
                    className={`rounded-lg border p-5 ${
                      patient.status === "Activo"
                        ? "border-ocean-100 bg-white"
                        : "border-slate-200 bg-slate-50"
                    }`}
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
                          <Link
                            className="font-bold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
                            href={`/dashboard/pacientes/${patient.id}`}
                          >
                            {patient.name}
                          </Link>
                          <p className="mt-1 text-sm text-slate-500">
                            DNI {patient.document} · {patient.condition}
                          </p>
                          <span
                            className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                              patient.status === "Activo"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {patient.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700"
                          href={`/dashboard/pacientes/${patient.id}`}
                        >
                          Ver historial
                        </Link>
                        <Link
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                          href={`/dashboard/turnos/nuevo?paciente=${patient.id}`}
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Nuevo turno
                        </Link>
                        {patient.status === "Activo" ? (
                          <details className="relative">
                            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">
                              Mas
                            </summary>
                            <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-ocean-100 bg-white p-2 shadow-soft">
                              <button
                                className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                onClick={() => handleDisablePatient(patient.id)}
                                type="button"
                              >
                                <UserMinus className="h-4 w-4" />
                                Deshabilitar
                              </button>
                            </div>
                          </details>
                        ) : null}
                      </div>
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
            )}

            {patients.length > 0 && filteredPatients.length === 0 ? (
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
