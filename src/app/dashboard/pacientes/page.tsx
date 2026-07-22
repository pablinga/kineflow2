"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarPlus,
  FileText,
  LayoutGrid,
  List,
  Mail,
  Phone,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserRound,
  UserX,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { NuevoPacienteModal } from "@/components/patients/NuevoPacienteModal";
import { usePatients, type NewPatientInput, type Patient } from "@/hooks/usePatients";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { useTreatments, type NewTreatmentInput } from "@/hooks/useTreatments";
import { canCreatePatient } from "@/lib/billing";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";
import { getSupabaseClient } from "@/lib/supabase";

const emptyPatient: NewPatientInput = {
  assignedProfessionalId: "",
  name: "",
  document: "",
  phone: "",
  email: "",
  condition: "",
};

const emptyInitialTreatment: Omit<NewTreatmentInput, "patientId" | "startedAt"> = {
  bodyRegion: "",
  diagnosis: "",
  notes: "",
  totalSessions: 10,
};

type PatientViewMode = "cards" | "list";

const PATIENTS_PAGE_SIZE = 25;

type ClinicProfessionalOption = {
  email: string;
  id: string;
  name: string;
  professionalId: string;
};

type ClinicProfessionalRow = {
  id: string;
  professional_email: string;
  professional_id: string | null;
  profiles:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null;
};

function getProfile(
  profile:
    | { full_name: string | null; email: string | null }
    | Array<{ full_name: string | null; email: string | null }>
    | null,
) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function getPatientInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function PatientsPage() {
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const {
    addPatient,
    disablePatient,
    error,
    loaded,
    activePatientCount,
    pageSize,
    patients,
    reactivatePatient,
    totalCount,
    updatePatient,
  } = usePatients({
    page: currentPage,
    pageSize: PATIENTS_PAGE_SIZE,
    search: query,
  });
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { addTreatment } = useTreatments(undefined, { enabled: false });
  const [viewMode, setViewMode] = useState<PatientViewMode>("cards");
  const [showForm, setShowForm] = useState(false);
  const [newPatient, setNewPatient] = useState<NewPatientInput>(emptyPatient);
  const [createInitialTreatment, setCreateInitialTreatment] = useState(false);
  const [initialTreatment, setInitialTreatment] = useState(emptyInitialTreatment);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [editPatient, setEditPatient] = useState<NewPatientInput>(emptyPatient);
  const [clinicProfessionals, setClinicProfessionals] = useState<
    ClinicProfessionalOption[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNotice, setActionNotice] = useState("");

  const filteredPatients = patients;

  const activeFilteredPatients = filteredPatients.filter(
    (patient) => patient.status === "Activo",
  );
  const inactiveFilteredPatients = filteredPatients.filter(
    (patient) => patient.status === "Inactivo",
  );
  const totalPages =
    pageSize && pageSize > 0 ? Math.max(Math.ceil(totalCount / pageSize), 1) : 1;
  const pageStart = totalCount === 0 ? 0 : (currentPage - 1) * PATIENTS_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PATIENTS_PAGE_SIZE, totalCount);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const storedViewMode = window.localStorage.getItem("kineflow.patients.view");

    if (params.get("nuevo") === "1") {
      setShowForm(true);
    }

    if (storedViewMode === "list" || storedViewMode === "cards") {
      setViewMode(storedViewMode);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("kineflow.patients.view", viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    async function loadClinicProfessionals() {
      if (
        activeWorkspace?.type !== "CLINICA" ||
        activeWorkspace.role !== "ADMIN" ||
        !activeWorkspace.sourceClinicId
      ) {
        setClinicProfessionals([]);
        return;
      }

      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from("clinic_professionals")
        .select("id, professional_email, professional_id, profiles(full_name, email)")
        .eq("clinic_id", activeWorkspace.sourceClinicId)
        .eq("status", "accepted")
        .not("professional_id", "is", null)
        .order("professional_email", { ascending: true });

      setClinicProfessionals(
        ((data ?? []) as unknown as ClinicProfessionalRow[])
          .filter((professional) => Boolean(professional.professional_id))
          .map((professional) => {
            const profile = getProfile(professional.profiles);
            const email = profile?.email ?? professional.professional_email;

            return {
              email,
              id: professional.id,
              name: profile?.full_name || email,
              professionalId: professional.professional_id ?? "",
            };
          }),
      );
    }

    loadClinicProfessionals();
  }, [
    activeWorkspace?.role,
    activeWorkspace?.sourceClinicId,
    activeWorkspace?.type,
  ]);

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

  if (loading || !loaded || !planLoaded || !workspaceLoaded) {
    return <DashboardLoading />;
  }

  const effectiveAccountType =
    activeWorkspace?.type === "CLINICA" ? "CONSULTORIO" : accountType;
  const canManagePatients =
    activeWorkspace?.type !== "CLINICA" || activeWorkspace.role === "ADMIN";
  const clinicPracticeBlocked =
    effectiveAccountType === "CONSULTORIO" &&
    plan.plan !== "FREE" &&
    !(plan.estadoPlan === "ACTIVO" && plan.plan.startsWith("CONSULTORIO_"));
  const canCreateCurrentPatient = canCreatePatient({
    accountType: effectiveAccountType,
    activePatientCount,
    patientLimit: plan.limitePacientes,
    plan: plan.plan,
    planStatus: plan.estadoPlan,
  });
  const freeLimitReached =
    activeWorkspace?.type !== "CLINICA" &&
    plan.plan === "FREE" &&
    plan.limitePacientes !== null &&
    plan.limitePacientes >= 0 &&
    activePatientCount >= plan.limitePacientes;
  const patientLimitBlock =
    activeWorkspace?.type === "CLINICA"
      ? null
      : getPatientPlanLimitBlock({
          activePatientCount,
          patientLimit: plan.limitePacientes,
        });
  const independentPlanMessage =
    "Esta funcionalidad está disponible en KineFlow - Particular. Podés activarlo para gestionar tus pacientes, turnos y cobros propios.";

  function updateField(field: keyof NewPatientInput, value: string) {
    setNewPatient((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field: keyof NewPatientInput, value: string) {
    setEditPatient((current) => ({ ...current, [field]: value }));
  }

  function updateInitialTreatmentField(
    field: keyof typeof emptyInitialTreatment,
    value: string | number,
  ) {
    setInitialTreatment((current) => ({ ...current, [field]: value }));
  }

  function validateContact(input: NewPatientInput) {
    if (!input.phone.trim() && !input.email.trim()) {
      return "Ingresá al menos un medio de contacto (teléfono o email)";
    }

    return "";
  }

  function openEditPatient(patient: Patient) {
    setEditingPatient(patient);
    setActionError("");
    setActionNotice("");
    setEditPatient({
      condition: patient.condition,
      document: patient.document,
      email: patient.email,
      name: patient.name,
      phone: patient.phone,
      status: patient.status,
      assignedProfessionalId: patient.assignedProfessionalId ?? "",
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setActionError("");
    setActionNotice("");

    try {
      const contactError = validateContact(newPatient);

      if (contactError) {
        setActionError(contactError);
        return;
      }

      if (patientLimitBlock) {
        setActionError(patientLimitBlock);
        return;
      }

      if (!canManagePatients) {
        setActionError("Solo el administrador de la clinica puede crear pacientes.");
        return;
      }

      if (
        activeWorkspace?.type === "CLINICA" &&
        activeWorkspace.role === "ADMIN" &&
        clinicProfessionals.length === 0
      ) {
        setActionError(
          "Primero agregá un kinesiólogo a la clínica para poder asignarle el paciente.",
        );
        return;
      }

      if (!canCreateCurrentPatient) {
        setActionError(
          freeLimitReached
            ? "Alcanzaste el límite del plan Free. El plan Free permite cargar hasta 5 pacientes. Para seguir agregando pacientes, activá KineFlow - Particular."
            : clinicPracticeBlocked
              ? "Para gestionar pacientes necesitás una suscripción activa."
              : independentPlanMessage,
        );
        return;
      }

      if (createInitialTreatment && !initialTreatment.diagnosis.trim()) {
        setActionError("Ingresá el diagnóstico del tratamiento inicial.");
        return;
      }

      const patientId = await addPatient(newPatient);

      if (createInitialTreatment) {
        await addTreatment({
          ...initialTreatment,
          diagnosis: initialTreatment.diagnosis.trim(),
          patientId,
          startedAt: new Date().toISOString().slice(0, 10),
        });
      }

      setNewPatient(emptyPatient);
      setCreateInitialTreatment(false);
      setInitialTreatment(emptyInitialTreatment);
      setShowForm(false);
      setActionNotice("Paciente creado correctamente");
    } catch (submitError) {
      setActionError(
        getFriendlyErrorMessage(submitError, "No pudimos guardar el paciente."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingPatient) {
      return;
    }

    setSaving(true);
    setActionError("");
    setActionNotice("");

    try {
      const contactError = validateContact(editPatient);

      if (contactError) {
        setActionError(contactError);
        return;
      }

      await updatePatient(editingPatient.id, editPatient);
      setEditingPatient(null);
      setActionNotice("Paciente actualizado correctamente");
    } catch (submitError) {
      setActionError(
        getFriendlyErrorMessage(submitError, "No pudimos actualizar el paciente."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDisablePatient(id: string) {
    if (!window.confirm("¿Querés deshabilitar este paciente?")) {
      return;
    }

    setActionError("");
    setActionNotice("");

    try {
      await disablePatient(id);
    } catch (disableError) {
      setActionError(
        getFriendlyErrorMessage(
          disableError,
          "No pudimos deshabilitar el paciente.",
        ),
      );
    }
  }

  async function handleReactivatePatient(id: string) {
    setActionError("");
    setActionNotice("");

    try {
      await reactivatePatient(id);
      setActionNotice("Paciente reactivado correctamente");
    } catch (reactivateError) {
      setActionError(
        getFriendlyErrorMessage(
          reactivateError,
          "No pudimos reactivar el paciente.",
        ),
      );
    }
  }

  function renderAssignedProfessionalSelect(params: {
    onChange: (value: string) => void;
    value: string;
  }) {
    if (activeWorkspace?.type !== "CLINICA" || activeWorkspace.role !== "ADMIN") {
      return null;
    }

    if (clinicProfessionals.length === 0) {
      return (
        <div className="md:col-span-2 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4">
          <p className="text-sm font-bold text-ink">Kinesiólogo asignado</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Todavía no hay kinesiólogos activos en esta clínica. Agregá el
            equipo antes de crear pacientes y turnos.
          </p>
          <Link
            className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700"
            href="/dashboard/equipo"
          >
            Agregar kinesiólogo
          </Link>
        </div>
      );
    }

    return (
      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700">
          Kinesiólogo asignado
        </span>
        <select
          className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
          onChange={(event) => params.onChange(event.target.value)}
          value={params.value}
        >
          <option value="">Sin asignar</option>
          {clinicProfessionals.map((professional) => (
            <option
              key={professional.id}
              value={professional.professionalId}
            >
              {professional.name} · {professional.email}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderPatientActions(patient: Patient) {
    return (
      <div className="flex items-center justify-end gap-1">
        <Link
          aria-label="Ver historial"
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          href={`/dashboard/pacientes/${patient.id}`}
          prefetch={false}
          title="Ver historial"
        >
          <FileText className="h-5 w-5" />
        </Link>
        {patientLimitBlock || patient.status === "Inactivo" ? (
          <button
            aria-label="Nuevo turno"
            className="inline-flex h-11 w-11 cursor-not-allowed items-center justify-center rounded-lg text-slate-300"
            disabled
            title={
              patient.status === "Inactivo"
                ? "Reactiv? el paciente para crear turnos."
                : patientLimitBlock ?? undefined
            }
            type="button"
          >
            <CalendarPlus className="h-5 w-5" />
          </button>
        ) : (
          <Link
            aria-label="Nuevo turno"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ocean-700 transition hover:bg-ocean-50 hover:text-ocean-900"
            href={`/dashboard/turnos/nuevo?paciente=${patient.id}`}
            title="Nuevo turno"
          >
            <CalendarPlus className="h-5 w-5" />
          </Link>
        )}
        {canManagePatients ? (
          <button
            aria-label="Editar paciente"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            onClick={() => openEditPatient(patient)}
            title="Editar paciente"
            type="button"
          >
            <Pencil className="h-5 w-5" />
          </button>
        ) : null}
        {canManagePatients && patient.status === "Activo" ? (
          <button
            aria-label="Deshabilitar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700"
            onClick={() => handleDisablePatient(patient.id)}
            title="Deshabilitar"
            type="button"
          >
            <UserX className="h-5 w-5" />
          </button>
        ) : canManagePatients ? (
          <button
            aria-label="Reactivar"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700"
            onClick={() => handleReactivatePatient(patient.id)}
            title="Reactivar"
            type="button"
          >
            <UserCheck className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer>
          <PageHeader
            actions={
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => {
                if (!canManagePatients) {
                  setActionError("Solo el administrador de la clinica puede crear pacientes.");
                  return;
                }

                if (patientLimitBlock) {
                  setActionError(patientLimitBlock);
                  return;
                }

                if (!canCreateCurrentPatient) {
                  setActionError(
                    freeLimitReached
                      ? "Alcanzaste el límite del plan Free. El plan Free permite cargar hasta 5 pacientes. Para seguir agregando pacientes, activá KineFlow - Particular."
                      : clinicPracticeBlocked
                        ? "Para gestionar pacientes necesitás una suscripción activa."
                        : independentPlanMessage,
                  );
                  return;
                }

                setActionError("");
                setShowForm(true);
              }}
              disabled={Boolean(patientLimitBlock) || !canManagePatients}
              title={patientLimitBlock ?? undefined}
              type="button"
            >
              <Plus className="h-4 w-4" />
              Nuevo paciente
            </button>
            }
            description="Cargá pacientes, revisá su historial y agendá nuevos turnos."
            eyebrow="Pacientes"
            title="Gestión de pacientes"
          />

          {clinicPracticeBlocked ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 shadow-card sm:mt-6 sm:p-5">
              <p className="font-bold text-amber-900">
                Suscripción requerida
              </p>
              <p className="mt-1 text-sm leading-6 text-amber-800">
                Para gestionar pacientes necesitás una suscripción activa.
              </p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Ver planes
              </Link>
            </section>
          ) : plan.plan === "FREE" ? (
            <section className="mt-4 rounded-lg border border-ocean-200 bg-white p-4 shadow-card sm:mt-6 sm:p-5">
              <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                  <p className="font-bold text-ink">
                    Plan Free: {activePatientCount}
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

          {actionNotice ? (
            <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 sm:mt-6 sm:p-5">
              {actionNotice}
            </div>
          ) : null}

          {error || (!showForm && actionError) ? (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700 sm:mt-6 sm:p-5">
              <p className="font-bold">
                {freeLimitReached && actionError
                  ? "Alcanzaste el límite del plan Free"
                  : "No pudimos completar la acción"}
              </p>
              <p className="mt-1">{(!showForm && actionError) || error}</p>
              {actionError === patientLimitBlock ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                  href="/dashboard/planes"
                >
                  Reactivar plan
                </Link>
              ) : ((!showForm && actionError) || error).includes("Plan Free") ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                  href="/dashboard/planes"
                >
                  Ver planes
                </Link>
              ) : null}
            </div>
          ) : null}

          <NuevoPacienteModal
            assignedProfessionalSelect={renderAssignedProfessionalSelect({
              onChange: (value) => updateField("assignedProfessionalId", value),
              value: newPatient.assignedProfessionalId ?? "",
            })}
            createInitialTreatment={createInitialTreatment}
            error={actionError}
            initialTreatment={initialTreatment}
            isOpen={showForm}
            newPatient={newPatient}
            onClose={() => setShowForm(false)}
            onSubmit={handleSubmit}
            onToggleInitialTreatment={setCreateInitialTreatment}
            onUpdateField={updateField}
            onUpdateInitialTreatmentField={updateInitialTreatmentField}
            saving={saving}
          />

          <section className="mt-4 sm:mt-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <label className="flex min-h-11 flex-1 items-center gap-3 rounded-lg border border-ocean-100 bg-ocean-50 px-4 py-3 focus-within:border-ocean-400">
              <Search className="h-5 w-5 text-ocean-600" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Buscar por nombre, DNI, patología, email, teléfono o estado"
                type="search"
                value={query}
              />
              </label>
              <div className="grid grid-cols-2 rounded-lg border border-ocean-100 bg-white p-1">
                <button
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
                    viewMode === "cards"
                      ? "bg-ocean-600 text-white"
                      : "text-ocean-800 hover:bg-ocean-50"
                  }`}
                  onClick={() => setViewMode("cards")}
                  type="button"
                >
                  <LayoutGrid className="h-4 w-4" />
                  Cards
                </button>
                <button
                  className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
                    viewMode === "list"
                      ? "bg-ocean-600 text-white"
                      : "text-ocean-800 hover:bg-ocean-50"
                  }`}
                  onClick={() => setViewMode("list")}
                  type="button"
                >
                  <List className="h-4 w-4" />
                  Lista
                </button>
              </div>
            </div>

            {totalCount === 0 && !query.trim() ? (
              <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-8 text-center">
                <UserRound className="mx-auto h-8 w-8 text-ocean-600" />
                <p className="mt-3 font-semibold text-ink">
                  Todavía no hay pacientes cargados.
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                  Creá el primer paciente para empezar a programar turnos y
                  registrar evoluciones.
                </p>
              </div>
            ) : viewMode === "list" ? (
              <div className="mt-5 space-y-6">
                {[
                  { label: "ACTIVOS", patients: activeFilteredPatients },
                  { label: "INACTIVOS", patients: inactiveFilteredPatients },
                ].map((group) => (
                  <div className="space-y-2" key={group.label}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {group.label} ({group.patients.length})
                    </p>
                    <div className="overflow-visible rounded-lg border border-ocean-100 bg-white shadow-card">
                      {group.patients.length === 0 ? (
                        <p className="px-4 py-4 text-sm text-slate-500">
                          Sin pacientes en esta seccion.
                        </p>
                      ) : (
                        group.patients.map((patient) => (
                          <div
                            className="grid gap-3 border-b border-ocean-50 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.8fr)_9rem_minmax(0,1fr)_minmax(0,1fr)_3rem] md:items-center"
                            key={patient.id}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean-100 text-sm font-bold text-ocean-800">
                                {getPatientInitials(patient.name)}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  className="block truncate font-bold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
                                  href={`/dashboard/pacientes/${patient.id}`}
                                  prefetch={false}
                                >
                                  {patient.name}
                                </Link>
                                <p className="mt-1 truncate text-sm text-slate-500">
                                  DNI {patient.document} · {patient.condition}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                                patient.status === "Activo"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {patient.status}
                            </span>
                            <p className="text-sm font-medium text-slate-700">
                              {patient.nextAppointment}
                            </p>
                            <p className="text-sm font-medium text-slate-700">
                              {patient.lastPaymentStatus}
                            </p>
                            <div className="flex justify-end">
                              {renderPatientActions(patient)}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {filteredPatients.map((patient) => (
                  <article
                    className={`rounded-lg border p-4 shadow-card ${
                      patient.status === "Activo"
                        ? "border-ocean-100 bg-white"
                        : "border-slate-200 bg-slate-50"
                    }`}
                    key={patient.id}
                  >
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-100 text-sm font-bold text-ocean-800">
                          {patient.name
                            .split(" ")
                            .map((part) => part[0])
                            .join("")}
                        </div>
                        <div className="min-w-0">
                          <Link
                            className="block truncate font-bold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline"
                            href={`/dashboard/pacientes/${patient.id}`}
                            prefetch={false}
                          >
                            {patient.name}
                          </Link>
                          <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
                            DNI {patient.document} · {patient.condition}
                          </p>
                          <span
                            className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              patient.status === "Activo"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {patient.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end">
                        {renderPatientActions(patient)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                      <p className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-ocean-600" />
                        {patient.phone || "Sin teléfono"}
                      </p>
                      <p className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-ocean-600" />
                        {patient.email || "Sin email"}
                      </p>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
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

            {query.trim() && totalCount === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-8 text-center">
                <UserRound className="mx-auto h-8 w-8 text-ocean-600" />
                <p className="mt-3 font-semibold text-ink">
                  No encontramos pacientes con esa búsqueda.
                </p>
              </div>
            ) : null}

            {totalCount > PATIENTS_PAGE_SIZE ? (
              <div className="mt-6 flex flex-col gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-card sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Mostrando {pageStart}-{pageEnd} de {totalCount} pacientes
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ocean-200 px-4 font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((value) => Math.max(value - 1, 1))}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span className="font-semibold text-ink">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ocean-200 px-4 font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={currentPage >= totalPages}
                    onClick={() =>
                      setCurrentPage((value) => Math.min(value + 1, totalPages))
                    }
                    type="button"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            ) : null}
          </section>
      </PageContainer>
      {editingPatient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 py-6">
          <form
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
            onSubmit={handleEditSubmit}
          >
            <h2 className="text-lg font-bold text-ink">Editar paciente</h2>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Nombre completo
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateEditField("name", event.target.value)}
                  required
                  type="text"
                  value={editPatient.name}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">DNI</span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateEditField("document", event.target.value)
                  }
                  required
                  type="text"
                  value={editPatient.document}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Teléfono
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateEditField("phone", event.target.value)}
                  type="tel"
                  value={editPatient.phone}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Email
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => updateEditField("email", event.target.value)}
                  type="email"
                  value={editPatient.email}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Estado
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateEditField(
                      "status",
                      event.target.value,
                    )
                  }
                  value={editPatient.status ?? "Activo"}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm font-semibold text-slate-700">
                  Motivo de consulta / diagnóstico inicial
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    updateEditField("condition", event.target.value)
                  }
                  required
                  type="text"
                  value={editPatient.condition}
                />
              </label>
              {renderAssignedProfessionalSelect({
                onChange: (value) =>
                  updateEditField("assignedProfessionalId", value),
                value: editPatient.assignedProfessionalId ?? "",
              })}
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                onClick={() => setEditingPatient(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                disabled={saving}
                type="submit"
              >
                {saving ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
