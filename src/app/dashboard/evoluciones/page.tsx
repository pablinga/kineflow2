"use client";

import { useState } from "react";
import { Activity, ClipboardPlus, Save } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useEvolutions, type NewEvolutionInput } from "@/hooks/useEvolutions";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const today = new Date().toISOString().slice(0, 10);

const emptyEvolution: NewEvolutionInput = {
  patientId: "",
  sessionDate: today,
  painLevel: 0,
  mobilityNotes: "",
  clinicalNotes: "",
  nextGoals: "",
};

export default function EvolutionsPage() {
  const { loading } = useRequireAuth();
  const { addEvolution, error, evolutions, loaded: evolutionsLoaded } =
    useEvolutions();
  const { activePatients, loaded: patientsLoaded } = usePatients();
  const [evolution, setEvolution] = useState<NewEvolutionInput>(emptyEvolution);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  if (loading || !patientsLoaded || !evolutionsLoaded) {
    return <DashboardLoading />;
  }

  function updateField<Field extends keyof NewEvolutionInput>(
    field: Field,
    value: NewEvolutionInput[Field],
  ) {
    setEvolution((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");

    try {
      await addEvolution(evolution);
      setEvolution(emptyEvolution);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos guardar la evolución.",
      );
    } finally {
      setSaving(false);
    }
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

          {(error || actionError) ? (
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError || error}
            </p>
          ) : null}

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
                  <p className="text-sm text-slate-500">
                    Se guarda en Supabase y queda asociada al paciente.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Paciente
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => updateField("patientId", event.target.value)}
                    required
                    value={evolution.patientId}
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
                    onChange={(event) =>
                      updateField("sessionDate", event.target.value)
                    }
                    required
                    type="date"
                    value={evolution.sessionDate}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Dolor
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      updateField("painLevel", Number(event.target.value))
                    }
                    value={evolution.painLevel}
                  >
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                      <option key={value} value={value}>
                        {value}/10
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">
                  Movilidad / fuerza
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateField("mobilityNotes", event.target.value)
                  }
                  placeholder="Ej. Mejora de rango en flexión"
                  required
                  type="text"
                  value={evolution.mobilityNotes}
                />
              </label>
              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">
                  Notas clínicas
                </span>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateField("clinicalNotes", event.target.value)
                  }
                  placeholder="Resumen de la sesión, respuesta al tratamiento y próximos objetivos"
                  required
                  value={evolution.clinicalNotes}
                />
              </label>
              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">
                  Próximos objetivos
                </span>
                <textarea
                  className="mt-2 min-h-24 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateField("nextGoals", event.target.value)}
                  placeholder="Objetivos o indicaciones para la próxima sesión"
                  value={evolution.nextGoals}
                />
              </label>

              <button
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={activePatients.length === 0 || saving}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar evolución"}
              </button>
            </form>

            <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-ink">Historial reciente</h2>
              <div className="mt-5 space-y-4">
                {evolutions.map((item) => (
                  <article
                    className="rounded-lg border border-ocean-100 p-4"
                    key={item.id}
                  >
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div>
                        <h3 className="font-bold text-ink">{item.patient}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.date}
                        </p>
                      </div>
                      <span className="flex w-fit items-center gap-2 rounded-full bg-ocean-50 px-3 py-1 text-sm font-semibold text-ocean-800">
                        <Activity className="h-4 w-4" />
                        Dolor {item.pain}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold text-ocean-800">
                      {item.mobility}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {item.notes}
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
                    Cuando guardes evoluciones reales, aparecerán en este historial.
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
