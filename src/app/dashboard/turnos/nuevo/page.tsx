"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Save } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useAppointments, type NewAppointmentInput } from "@/hooks/useAppointments";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const today = new Date().toISOString().slice(0, 10);

const emptyAppointment: NewAppointmentInput = {
  patientId: "",
  date: today,
  time: "",
  reason: "",
  durationMinutes: 45,
  modality: "presencial",
  notes: "",
};

export default function NewAppointmentPage() {
  const router = useRouter();
  const { authError, loading, redirecting } = useRequireAuth();
  const { addAppointment } = useAppointments();
  const { activePatients, loaded } = usePatients();
  const [patientFromUrl, setPatientFromUrl] = useState("");
  const [appointment, setAppointment] =
    useState<NewAppointmentInput>(emptyAppointment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const patientId = params.get("paciente") ?? "";

    if (patientId) {
      setPatientFromUrl(patientId);
      setAppointment((current) => ({ ...current, patientId }));
    }
  }, []);

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

  if (loading || !loaded) {
    return <DashboardLoading />;
  }

  const preselectedPatient = activePatients.find(
    (patient) => patient.id === patientFromUrl,
  );

  function updateField<Field extends keyof NewAppointmentInput>(
    field: Field,
    value: NewAppointmentInput[Field],
  ) {
    setAppointment((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await addAppointment(appointment);
      router.push(
        preselectedPatient
          ? `/dashboard/pacientes/${preselectedPatient.id}`
          : "/dashboard/turnos",
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos guardar el turno.",
      );
    } finally {
      setSaving(false);
    }
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
              Cargá los datos del turno y guardalo en Supabase.
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
                  onChange={(event) => updateField("patientId", event.target.value)}
                  required
                  disabled={Boolean(preselectedPatient)}
                  value={appointment.patientId}
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
                {preselectedPatient ? (
                  <p className="mt-2 text-sm text-ocean-700">
                    Paciente preseleccionado desde su historial.
                  </p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Motivo
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateField("reason", event.target.value)}
                  placeholder="Ej. Rehabilitación de rodilla"
                  required
                  type="text"
                  value={appointment.reason}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Fecha</span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateField("date", event.target.value)}
                  required
                  type="date"
                  value={appointment.date}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">Hora</span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateField("time", event.target.value)}
                  required
                  type="time"
                  value={appointment.time}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Duración
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateField("durationMinutes", Number(event.target.value))
                  }
                  value={appointment.durationMinutes}
                >
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>60 min</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Modalidad
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateField(
                      "modality",
                      event.target.value as NewAppointmentInput["modality"],
                    )
                  }
                  value={appointment.modality}
                >
                  <option value="presencial">Presencial</option>
                  <option value="domicilio">Domicilio</option>
                  <option value="virtual">Virtual</option>
                </select>
              </label>
            </div>
            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-700">
                Observaciones
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Notas internas para preparar la sesión"
                value={appointment.notes}
              />
            </label>

            {error ? (
              <p className="mt-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {error}
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
                disabled={activePatients.length === 0 || saving}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar turno"}
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
