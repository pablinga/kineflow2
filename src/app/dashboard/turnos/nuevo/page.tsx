"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarCheck, Save } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PatientSearchSelect } from "@/components/patients/PatientSearchSelect";
import { useAppointments, type NewAppointmentInput } from "@/hooks/useAppointments";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { useTreatments } from "@/hooks/useTreatments";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";

type ClinicProfessionalOption = {
  id: string;
  professional_id: string;
  clinic_id: string;
  profiles: { full_name: string; license_number: string | null } | Array<{ full_name: string; license_number: string | null }> | null;
  clinics: { name: string } | Array<{ name: string }> | null;
};

const today = new Date().toISOString().slice(0, 10);

const emptyAppointment: NewAppointmentInput = {
  patientId: "",
  date: today,
  time: "",
  durationMinutes: 45,
  modality: "presencial",
  notes: "",
  sessionNumber: null,
  treatmentId: "",
};

export default function NewAppointmentPage() {
  const router = useRouter();
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { addAppointment, addClinicAppointment, appointments } = useAppointments();
  const { activePatients, loaded } = usePatients();
  const [clinicProfessionals, setClinicProfessionals] = useState<
    ClinicProfessionalOption[]
  >([]);
  const [selectedClinicProfessionalId, setSelectedClinicProfessionalId] =
    useState("");
  const [patientFromUrl, setPatientFromUrl] = useState("");
  const [appointment, setAppointment] =
    useState<NewAppointmentInput>(emptyAppointment);
  const {
    activeTreatments,
    loaded: treatmentsLoaded,
  } = useTreatments(appointment.patientId || undefined);
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

  useEffect(() => {
    async function loadClinicProfessionals() {
      if (accountType !== "CONSULTORIO") {
        return;
      }

      const { getSupabaseClient } = await import("@/lib/supabase");
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("clinic_professionals")
        .select(
          "id, professional_id, clinic_id, profiles(full_name, license_number), clinics(name)",
        )
        .eq("status", "accepted")
        .order("invited_at", { ascending: false });

      setClinicProfessionals(
        (data ?? []) as unknown as ClinicProfessionalOption[],
      );
    }

    loadClinicProfessionals();
  }, [accountType]);

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

  if (loading || !loaded || !planLoaded || !treatmentsLoaded) {
    return <DashboardLoading />;
  }

  const independentPracticeBlocked = false;
  const clinicPlanBlocked =
    accountType === "CONSULTORIO" &&
    !(plan.estadoPlan === "ACTIVO" && plan.plan.startsWith("CONSULTORIO_"));
  const patientLimitBlock = getPatientPlanLimitBlock({
    activePatientCount: activePatients.length,
    patientLimit: plan.limitePacientes,
  });
  const independentPlanMessage =
    "Esta funcionalidad está disponible en KineFlow - Particular. Podés activarlo para gestionar tus pacientes, turnos y cobros propios.";

  const preselectedPatient = activePatients.find(
    (patient) => patient.id === patientFromUrl,
  );
  const conflictingAppointment =
    appointment.date && appointment.time
      ? appointments.find((item) => {
          if (item.status === "Cancelado") {
            return false;
          }

          const start = new Date(`${appointment.date}T${appointment.time}`).getTime();
          const end = start + appointment.durationMinutes * 60 * 1000;
          const itemStart = new Date(item.scheduledAt).getTime();
          const itemEnd = itemStart + item.durationMinutes * 60 * 1000;

          return start < itemEnd && end > itemStart;
        })
      : null;

  function updateField<Field extends keyof NewAppointmentInput>(
    field: Field,
    value: NewAppointmentInput[Field],
  ) {
    setAppointment((current) => ({ ...current, [field]: value }));
  }

  function updatePatient(patientId: string) {
    setAppointment((current) => ({
      ...current,
      patientId,
      sessionNumber: null,
      treatmentId: "",
    }));
  }

  function updateTreatment(treatmentId: string) {
    const selectedTreatment = activeTreatments.find(
      (treatment) => treatment.id === treatmentId,
    );

    setAppointment((current) => ({
      ...current,
      sessionNumber: selectedTreatment
        ? selectedTreatment.usedSessions + 1
        : null,
      treatmentId,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (accountType === "CONSULTORIO") {
        if (clinicPlanBlocked) {
          setError(
            "Para crear turnos del consultorio necesitás una suscripción activa del Plan Consultorio.",
          );
          return;
        }

        if (clinicProfessionals.length === 0) {
          setError(
            "Todavía no tenés kinesiólogos activos. Cuando el profesional acepte la invitación, vas a poder asignarle turnos.",
          );
          return;
        }

        const selectedProfessional = clinicProfessionals.find(
          (professional) => professional.id === selectedClinicProfessionalId,
        );

        if (!selectedProfessional) {
          setError("Seleccioná un kinesiólogo vinculado al consultorio.");
          return;
        }

        await addClinicAppointment({
          ...appointment,
          clinicId: selectedProfessional.clinic_id,
          clinicProfessionalId: selectedProfessional.id,
          professionalId: selectedProfessional.professional_id,
        });
      } else {
        if (patientLimitBlock) {
          setError(patientLimitBlock);
          return;
        }

        if (independentPracticeBlocked) {
          setError(independentPlanMessage);
          return;
        }

        await addAppointment(appointment);
      }
      router.push(
        preselectedPatient
          ? `/dashboard/pacientes/${preselectedPatient.id}`
          : "/dashboard/turnos",
      );
    } catch (submitError) {
      setError(
        getFriendlyErrorMessage(submitError, "No pudimos guardar el turno."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <Link
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-ocean-700"
            href="/dashboard/turnos"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a turnos
          </Link>

          <header className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
            <p className="text-sm font-semibold text-ocean-700">Nuevo turno</p>
            <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
              Programar una sesión
            </h1>
            <p className="mt-2 text-slate-600">
              Completá los datos de la sesión.
            </p>
          </header>

          {independentPracticeBlocked ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              {independentPlanMessage}
            </section>
          ) : null}

          {accountType === "CONSULTORIO" && clinicProfessionals.length === 0 ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              Para crear un turno, primero tenés que agregar un kinesiólogo al
              consultorio y esperar que acepte la invitación.
            </section>
          ) : null}

          {clinicPlanBlocked ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              Para crear turnos del consultorio necesitás una suscripción activa
              del Plan Consultorio.
            </section>
          ) : null}

          {patientLimitBlock ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              <p>{patientLimitBlock}</p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Reactivar plan
              </Link>
            </section>
          ) : null}

          <form
            className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:mt-6 sm:p-5"
            onSubmit={handleSubmit}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {accountType === "CONSULTORIO" ? (
                <label className="block md:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Kinesiólogo
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      setSelectedClinicProfessionalId(event.target.value)
                    }
                    required
                    value={selectedClinicProfessionalId}
                  >
                    <option value="">Seleccionar profesional vinculado</option>
                    {clinicProfessionals.map((professional) => {
                      const profile = Array.isArray(professional.profiles)
                        ? professional.profiles[0]
                        : professional.profiles;
                      const clinic = Array.isArray(professional.clinics)
                        ? professional.clinics[0]
                        : professional.clinics;

                      return (
                        <option key={professional.id} value={professional.id}>
                          {profile?.full_name ?? "Kinesiólogo"} ·{" "}
                          {clinic?.name ?? "Consultorio"}
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : null}
              <div>
                <PatientSearchSelect
                  disabled={Boolean(preselectedPatient)}
                  onChange={updatePatient}
                  patients={activePatients}
                  required
                  value={appointment.patientId}
                />
                {activePatients.length === 0 ? (
                  <p className="mt-2 text-sm text-amber-700">
                    Primero carga un paciente activo para asignarle un turno.
                  </p>
                ) : null}
                {preselectedPatient ? (
                  <p className="mt-2 text-sm text-ocean-700">
                    Paciente preseleccionado desde su historial.
                  </p>
                ) : null}
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Tratamiento
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  disabled={!appointment.patientId}
                  onChange={(event) => updateTreatment(event.target.value)}
                  value={appointment.treatmentId}
                >
                  <option value="">Sin tratamiento</option>
                  {activeTreatments.map((treatment) => (
                    <option key={treatment.id} value={treatment.id}>
                      {treatment.diagnosis}
                      {treatment.bodyRegion ? ` · ${treatment.bodyRegion}` : ""} (
                      {treatment.usedSessions}/{treatment.totalSessions} sesiones)
                    </option>
                  ))}
                </select>
                {appointment.patientId && activeTreatments.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Este paciente no tiene tratamientos activos. Creá uno desde
                    su{" "}
                    <Link
                      className="font-semibold text-ocean-700 underline-offset-4 hover:underline"
                      href={`/dashboard/pacientes/${appointment.patientId}`}
                    >
                      ficha
                    </Link>
                    .
                  </p>
                ) : null}
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
            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">
                Observaciones
              </span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400 sm:min-h-28"
                onChange={(event) => updateField("notes", event.target.value)}
                placeholder="Notas internas para preparar la sesión"
                value={appointment.notes}
              />
            </label>

            {conflictingAppointment ? (
              <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:mt-5">
                Ya existe un turno de {conflictingAppointment.patient} a las{" "}
                {conflictingAppointment.time}. PodÃ©s guardar igualmente si la
                superposiciÃ³n es intencional.
              </p>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 sm:mt-5">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:justify-end">
              <Link
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                href="/dashboard/turnos"
              >
                Cancelar
              </Link>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  activePatients.length === 0 ||
                  saving ||
                  Boolean(patientLimitBlock) ||
                  independentPracticeBlocked ||
                  clinicPlanBlocked ||
                  (accountType === "CONSULTORIO" &&
                    clinicProfessionals.length === 0)
                }
                title={patientLimitBlock ?? undefined}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {saving
                  ? "Guardando..."
                  : conflictingAppointment
                    ? "Guardar igual"
                    : "Guardar turno"}
              </button>
            </div>
          </form>

          <div className="mt-6 hidden rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:block">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-100 text-ocean-700">
                <CalendarCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold text-ink">Próxima mejora</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Mostrar advertencias cuando existan turnos superpuestos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
