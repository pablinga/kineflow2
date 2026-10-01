"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PatientSearchSelect } from "@/components/patients/PatientSearchSelect";
import {
  getMondayOfWeek,
  type PickerSlot,
  SlotPicker,
} from "@/components/turnos/SlotPicker";
import { Alert } from "@/components/ui/Alert";
import { FieldLabel } from "@/components/ui/FieldLabel";
import {
  useAppointments,
  type NewAppointmentInput,
  type PaymentType,
  evaluateAppointmentConflict,
  getWorkspaceCapacityMap,
} from "@/hooks/useAppointments";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import { useArtProviders } from "@/hooks/useArtProviders";
import { type AttentionType, useAttentionTypes } from "@/hooks/useAttentionTypes";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useTreatments } from "@/hooks/useTreatments";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { getPrefilledSessionAmount } from "@/lib/attention-pricing";
import { getPatientPlanLimitBlock } from "@/lib/patient-plan-limit";
import {
  APPOINTMENT_DURATION_OPTIONS,
  DEFAULT_SESSION_DURATION_MINUTES,
  DEFAULT_SESSION_PRICE,
} from "@/lib/session-defaults";
import { isWorkspaceStaff } from "@/lib/workspace-permissions";
import { toArgentinaDateValue } from "@/lib/dates";

type ClinicProfessionalOption = {
  id: string;
  professional_email: string;
  professional_id: string | null;
  clinic_id: string;
  profiles: { full_name: string; license_number: string | null } | Array<{ full_name: string; license_number: string | null }> | null;
  clinics: { name: string } | Array<{ name: string }> | null;
  clinic_professional_availability:
    | Array<{
        weekday: number;
        starts_at: string;
        ends_at: string;
        active: boolean;
      }>
    | null;
};

// Se arma al montar el formulario (no a nivel de módulo) para que "hoy" no
// quede fijo desde que se cargó la página.
const createEmptyAppointment = (): NewAppointmentInput => ({
  patientId: "",
  date: toArgentinaDateValue(),
  time: "",
  durationMinutes: DEFAULT_SESSION_DURATION_MINUTES,
  modality: "presencial",
  notes: "",
  sessionNumber: null,
  treatmentId: "",
});

function parseTimeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.slice(0, 5).split(":");

  return Number(hours) * 60 + Number(minutes);
}

function getAppointmentWeekday(date: string) {
  return new Date(`${date}T00:00:00`).getDay();
}

function professionalMatchesAvailability(
  professional: ClinicProfessionalOption,
  appointment: NewAppointmentInput,
) {
  const activeAvailability = (
    professional.clinic_professional_availability ?? []
  ).filter((availability) => availability.active);

  if (activeAvailability.length === 0) {
    return true;
  }

  if (!appointment.date || !appointment.time) {
    return true;
  }

  const weekday = getAppointmentWeekday(appointment.date);
  const startMinutes = parseTimeToMinutes(appointment.time);
  const endMinutes = startMinutes + appointment.durationMinutes;

  return activeAvailability.some((availability) => {
    if (availability.weekday !== weekday) {
      return false;
    }

    return (
      startMinutes >= parseTimeToMinutes(availability.starts_at) &&
      endMinutes <= parseTimeToMinutes(availability.ends_at)
    );
  });
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const { accountType, authError, loading, redirecting, user } = useRequireAuth();
  const {
    activeWorkspace,
    loaded: workspaceLoaded,
    workspaces,
  } = useActiveWorkspace();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { accessLevel, isReadOnly, loaded: accessLoaded } = useAccessLevel();
  const { addAppointment, addClinicAppointment, appointments } = useAppointments(
    undefined,
    // El kinesiólogo ve también sus turnos de clínica, para detectar choques
    // con otro consultorio (la base los rechaza siempre).
    {
      unified:
        accountType === "KINESIOLOGO" && activeWorkspace?.type !== "CLINICA",
    },
  );
  const { activePatients, loaded } = usePatients();
  const [clinicProfessionals, setClinicProfessionals] = useState<
    ClinicProfessionalOption[]
  >([]);
  const [selectedClinicProfessionalId, setSelectedClinicProfessionalId] =
    useState("");
  const [patientFromUrl, setPatientFromUrl] = useState("");
  const [appointment, setAppointment] =
    useState<NewAppointmentInput>(createEmptyAppointment);
  const {
    activeTreatments,
    loaded: treatmentsLoaded,
  } = useTreatments(appointment.patientId || undefined);
  const { providers: insuranceProviders } = useInsuranceProviders();
  const activeInsuranceProviders = insuranceProviders.filter(
    (provider) => provider.active,
  );
  const { providers: artProviders } = useArtProviders();
  const activeArtProviders = artProviders.filter((provider) => provider.active);
  // Catálogo de la clínica (RPG, ATM, ...): solo activos. Vacío = el formulario
  // funciona como siempre.
  const { attentionTypes } = useAttentionTypes();
  const [attentionTypeId, setAttentionTypeId] = useState("");
  const [sessionAmount, setSessionAmount] = useState<number | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType>("PARTICULAR");
  const [insuranceProviderId, setInsuranceProviderId] = useState("");
  const [artProviderId, setArtProviderId] = useState("");
  const [insuranceMemberNumber, setInsuranceMemberNumber] = useState("");
  // Se inicializa y se reaplica según el tipo/cupo del workspace (ver efecto).
  const [allowsSimultaneous, setAllowsSimultaneous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [professionalAvailabilityNotice, setProfessionalAvailabilityNotice] =
    useState("");
  const hasLoadedOnceRef = useRef(false);
  const hasManuallySelectedProfessionalRef = useRef(false);
  const hasInitializedWorkspaceDefaultsRef = useRef(false);
  // Clínica: primero el profesional (o "Sin preferencia") y después un horario
  // libre, como en la reserva online. La carga manual queda como excepción.
  const [slotProfessionalFilter, setSlotProfessionalFilter] = useState("any");
  const [slotWeekStart, setSlotWeekStart] = useState(() =>
    getMondayOfWeek(toArgentinaDateValue()),
  );
  const [availableSlots, setAvailableSlots] = useState<PickerSlot[]>([]);
  const [slotHolidays, setSlotHolidays] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlotStart, setSelectedSlotStart] = useState("");
  const [manualDateEntry, setManualDateEntry] = useState(false);
  const selectedSlotRef = useRef({ professionalId: "", start: "" });

  const simultaneousCapacity = Math.max(
    1,
    activeWorkspace?.maxSimultaneousAppointments ?? 1,
  );
  // Solo tiene sentido elegir con cupo > 1. Con cupo 1 no se muestra y el
  // turno se guarda con el default de su tipo (CLINICA simultáneo, PERSONAL
  // exclusivo), para que se comporte igual si después se sube el cupo.
  const showSimultaneousToggle = simultaneousCapacity > 1;
  const selectedAttentionType =
    attentionTypes.find((type) => type.id === attentionTypeId) ?? null;
  // Con el checkbox oculto, el tipo de atención (si hay) define el valor.
  const effectiveAllowsSimultaneous = showSimultaneousToggle
    ? allowsSimultaneous
    : selectedAttentionType?.allowsSimultaneous ?? activeWorkspace?.type === "CLINICA";

  useEffect(() => {
    if (
      !workspaceLoaded ||
      !activeWorkspace ||
      hasInitializedWorkspaceDefaultsRef.current
    ) {
      return;
    }

    hasInitializedWorkspaceDefaultsRef.current = true;
    setAppointment((current) => ({
      ...current,
      durationMinutes:
        activeWorkspace.defaultSessionDurationMinutes ??
        DEFAULT_SESSION_DURATION_MINUTES,
    }));
    setSessionAmount(
      activeWorkspace.defaultSessionPrice ?? DEFAULT_SESSION_PRICE,
    );
  }, [activeWorkspace, workspaceLoaded]);

  // Default de "Turno simultáneo" según el workspace del turno: en una clínica
  // va marcado; en el espacio particular, desmarcado (y forzado a false con
  // cupo 1). Se reaplica si cambia el workspace activo o su cupo.
  const activeWorkspaceId = activeWorkspace?.id;
  const activeWorkspaceType = activeWorkspace?.type;
  const activeWorkspaceCapacity = activeWorkspace?.maxSimultaneousAppointments;

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }

    setAllowsSimultaneous(activeWorkspaceType === "CLINICA");
  }, [activeWorkspaceCapacity, activeWorkspaceId, activeWorkspaceType]);

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
      if (activeWorkspace?.type !== "CLINICA" || !activeWorkspace.sourceClinicId) {
        setClinicProfessionals([]);
        return;
      }

      const { getSupabaseClient } = await import("@/lib/supabase");
      const supabase = getSupabaseClient();
      let query = supabase
        .from("clinic_professionals")
        .select(
          "id, professional_email, professional_id, clinic_id, profiles(full_name, license_number), clinics(name), clinic_professional_availability(weekday, starts_at, ends_at, active)",
        )
        .eq("clinic_id", activeWorkspace.sourceClinicId)
        .eq("status", "active")
        .not("professional_id", "is", null)
        .order("professional_email", { ascending: true });

      if (activeWorkspace.role === "KINESIOLOGO" && user?.id) {
        query = query.eq("professional_id", user.id);
      }

      const { data } = await query;

      setClinicProfessionals((data ?? []) as unknown as ClinicProfessionalOption[]);
    }

    loadClinicProfessionals();
  }, [
    activeWorkspace?.role,
    activeWorkspace?.sourceClinicId,
    activeWorkspace?.type,
    user?.id,
  ]);

  useEffect(() => {
    if (activeWorkspace?.type !== "CLINICA") {
      return;
    }

    if (activeWorkspace.role === "KINESIOLOGO") {
      const ownLink = clinicProfessionals.find(
        (professional) => professional.professional_id === user?.id,
      );
      setSelectedClinicProfessionalId(ownLink?.id ?? "");
      return;
    }

    if (hasManuallySelectedProfessionalRef.current) {
      return;
    }

    const selectedPatient = activePatients.find(
      (patient) => patient.id === appointment.patientId,
    );
    const assignedProfessional = clinicProfessionals.find(
      (professional) =>
        professional.professional_id ===
        selectedPatient?.assignedProfessionalId,
    );

    setSelectedClinicProfessionalId(assignedProfessional?.id ?? "");
    // Con paciente elegido primero, se muestran directo los horarios de su
    // profesional asignado (se puede cambiar a "Sin preferencia").
    if (assignedProfessional) {
      setSlotProfessionalFilter(assignedProfessional.id);
    }
  }, [
    activePatients,
    activeWorkspace?.role,
    activeWorkspace?.type,
    appointment.patientId,
    clinicProfessionals,
    user?.id,
  ]);

  const pageReady =
    !loading && loaded && accessLoaded && planLoaded && treatmentsLoaded && workspaceLoaded;
  const isInitialLoading =
    !hasLoadedOnceRef.current &&
    (loading || !loaded || !accessLoaded || !planLoaded || !treatmentsLoaded || !workspaceLoaded);
  const isRefreshingTreatments =
    hasLoadedOnceRef.current &&
    Boolean(appointment.patientId) &&
    !treatmentsLoaded;

  useEffect(() => {
    if (pageReady) {
      hasLoadedOnceRef.current = true;
    }
  }, [pageReady]);

  const availableClinicProfessionals = useMemo(
    () =>
      clinicProfessionals.filter((professional) =>
        professionalMatchesAvailability(professional, appointment),
      ),
    [appointment, clinicProfessionals],
  );

  useEffect(() => {
    if (
      !appointment.date ||
      !appointment.time ||
      !selectedClinicProfessionalId
    ) {
      setProfessionalAvailabilityNotice("");
      return;
    }

    const selectedProfessional = clinicProfessionals.find(
      (professional) => professional.id === selectedClinicProfessionalId,
    );

    if (
      selectedProfessional &&
      !professionalMatchesAvailability(selectedProfessional, appointment)
    ) {
      setSelectedClinicProfessionalId("");
      setProfessionalAvailabilityNotice(
        "Este profesional no atiende en el horario elegido. Seleccioná otro.",
      );
      return;
    }

    setProfessionalAvailabilityNotice("");
  }, [
    appointment,
    clinicProfessionals,
    selectedClinicProfessionalId,
  ]);

  // Profesional por el que se piden horarios: en el rol KINESIOLOGO de una
  // clínica es siempre el propio; para el staff, el filtro elegido.
  const slotQueryProfessional =
    activeWorkspace?.type === "CLINICA" && activeWorkspace.role === "KINESIOLOGO"
      ? selectedClinicProfessionalId
      : slotProfessionalFilter;
  const slotQueryDuration = appointment.durationMinutes;
  const slotsEnabled =
    activeWorkspace?.type === "CLINICA" && Boolean(activeWorkspaceId && slotQueryProfessional);

  useEffect(() => {
    selectedSlotRef.current = {
      professionalId: selectedClinicProfessionalId,
      start: selectedSlotStart,
    };
  }, [selectedClinicProfessionalId, selectedSlotStart]);

  // Horarios libres: se recalculan al cambiar profesional, semana, duración o
  // simultaneidad (con debounce y cancelación del pedido anterior). Si el
  // horario elegido dejó de estar libre, se limpia la selección.
  useEffect(() => {
    if (!slotsEnabled || !activeWorkspaceId) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSlotsLoading(true);
      setSlotsError("");

      try {
        const { getSupabaseClient } = await import("@/lib/supabase");
        const { data } = await getSupabaseClient().auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          throw new Error("No pudimos identificar tu sesión.");
        }

        const query = new URLSearchParams({
          allowsSimultaneous: String(effectiveAllowsSimultaneous),
          durationMinutes: String(slotQueryDuration),
          from: slotWeekStart,
          professionalId: slotQueryProfessional,
          to: (() => {
            const end = new Date(`${slotWeekStart}T12:00:00`);
            end.setDate(end.getDate() + 6);
            return toArgentinaDateValue(end);
          })(),
          workspaceId: activeWorkspaceId,
        });
        const response = await fetch(`/api/appointments/availability?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          holidays?: string[];
          slots?: PickerSlot[];
        };

        if (!response.ok) {
          throw new Error(result.error ?? "No pudimos cargar los horarios.");
        }

        const nextSlots = result.slots ?? [];
        setAvailableSlots(nextSlots);
        setSlotHolidays(result.holidays ?? []);

        const current = selectedSlotRef.current;

        if (
          current.start &&
          !nextSlots.some(
            (slot) =>
              slot.start === current.start &&
              slot.professionals.some(
                (professional) =>
                  professional.clinicProfessionalId === current.professionalId,
              ),
          )
        ) {
          setSelectedSlotStart("");
          setAppointment((previous) => ({ ...previous, time: "" }));
        }
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        // Sin horarios no se bloquea a la clínica: se abre la carga manual.
        setAvailableSlots([]);
        setSlotsError(
          getFriendlyErrorMessage(loadError, "No pudimos cargar los horarios disponibles."),
        );
        setManualDateEntry(true);
      } finally {
        if (!controller.signal.aborted) {
          setSlotsLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeWorkspaceId,
    effectiveAllowsSimultaneous,
    slotQueryDuration,
    slotQueryProfessional,
    slotWeekStart,
    slotsEnabled,
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

  if (isInitialLoading) {
    return <DashboardLoading />;
  }

  const effectiveAccountType =
    activeWorkspace?.type === "CLINICA" ? "CONSULTORIO" : accountType;
  const isClinicWorkspace = activeWorkspace?.type === "CLINICA";
  // Staff de la clínica (admin o recepción): elige profesional y agenda para
  // cualquiera del equipo.
  const isClinicAdmin = isClinicWorkspace && isWorkspaceStaff(activeWorkspace);
  const isClinicProfessional =
    isClinicWorkspace && activeWorkspace.role === "KINESIOLOGO";
  const canCreateClinicSchedule =
    !isClinicWorkspace ||
    activeWorkspace.role === "ADMIN" ||
    activeWorkspace.role === "KINESIOLOGO" ||
    activeWorkspace.role === "RECEPCION";
  const canChangeClinicProfessional = isClinicAdmin;
  const independentPracticeBlocked = false;
  const clinicPlanBlocked =
    effectiveAccountType === "CONSULTORIO" &&
    plan.plan !== "FREE" &&
    !(plan.estadoPlan === "ACTIVO" && plan.plan === "CONSULTORIO");
  const patientLimitBlock =
    activeWorkspace?.type === "CLINICA"
      ? null
      : accessLevel === "TRIAL_ACTIVE"
        ? null
        : getPatientPlanLimitBlock({
          activePatientCount: activePatients.length,
          patientLimit: plan.limitePacientes,
        });
  const readOnlyMessage =
    "Tu período de prueba gratuita venció. Activá un plan para seguir gestionando pacientes.";
  const writeBlockMessage = isReadOnly ? readOnlyMessage : patientLimitBlock;
  const independentPlanMessage =
    "Esta funcionalidad está disponible en KineFlow - Particular. Podés activarlo para gestionar tus pacientes, turnos y cobros propios.";

  const preselectedPatient = activePatients.find(
    (patient) => patient.id === patientFromUrl,
  );
  // Profesional al que se le asigna el turno: el cupo y los choques se
  // cuentan por profesional, igual que el trigger de la base.
  const conflictOwnerId = isClinicWorkspace
    ? isClinicProfessional
      ? user?.id
      : clinicProfessionals.find(
          (professional) => professional.id === selectedClinicProfessionalId,
        )?.professional_id
    : user?.id;
  const appointmentConflict =
    appointment.date && appointment.time && conflictOwnerId
      ? evaluateAppointmentConflict(appointments, {
          allowsSimultaneous: effectiveAllowsSimultaneous,
          capacityByWorkspace: getWorkspaceCapacityMap(workspaces),
          durationMinutes: appointment.durationMinutes,
          ownerId: conflictOwnerId,
          scheduledAt: new Date(`${appointment.date}T${appointment.time}`).toISOString(),
          workspaceId: activeWorkspace?.id ?? null,
        })
      : null;

  // Recalcula el monto con la regla única (src/lib/attention-pricing.ts) cuando
  // cambia el tipo de pago, el prestador o el tipo de atención.
  function recalculateSessionAmount(
    changes: Partial<{
      artProviderId: string;
      attentionType: AttentionType | null;
      insuranceProviderId: string;
      paymentType: PaymentType;
    }>,
  ) {
    const next = {
      artProviderId,
      attentionType: selectedAttentionType,
      insuranceProviderId,
      paymentType,
      ...changes,
    };
    const provider =
      next.paymentType === "OBRA_SOCIAL"
        ? activeInsuranceProviders.find((item) => item.id === next.insuranceProviderId)
        : next.paymentType === "ART"
          ? activeArtProviders.find((item) => item.id === next.artProviderId)
          : undefined;
    const amount = getPrefilledSessionAmount({
      attentionTypePrice: next.attentionType?.price,
      particularDefaultPrice:
        activeWorkspace?.defaultSessionPrice ?? DEFAULT_SESSION_PRICE,
      paymentType: next.paymentType,
      providerPrice: provider?.sessionPrice,
    });

    if (amount !== undefined) {
      setSessionAmount(amount);
    }
  }

  function selectPaymentType(nextPaymentType: PaymentType) {
    setPaymentType(nextPaymentType);
    recalculateSessionAmount({ paymentType: nextPaymentType });
  }

  // Elegir un tipo de atención precarga duración, simultáneo, monto y motivo;
  // todo sigue editable. Volver a "Sin especificar" no borra nada: solo deja
  // de usarse para recalcular.
  function selectAttentionType(nextId: string) {
    const nextType = attentionTypes.find((type) => type.id === nextId) ?? null;
    const previousName = selectedAttentionType?.name ?? "";
    setAttentionTypeId(nextId);

    if (!nextType) {
      return;
    }

    setAppointment((current) => ({
      ...current,
      durationMinutes: nextType.durationMinutes,
      reason:
        !current.reason?.trim() || current.reason === previousName
          ? nextType.name
          : current.reason,
    }));
    setAllowsSimultaneous(nextType.allowsSimultaneous);
    recalculateSessionAmount({ attentionType: nextType });
  }

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
      if (isReadOnly) {
        setError(readOnlyMessage);
        return;
      }

      if (isClinicWorkspace) {
        if (!canCreateClinicSchedule) {
          setError("No tenés permisos para crear turnos de la clínica.");
          return;
        }

        if (!activeWorkspace.sourceClinicId) {
          setError("No encontramos la clínica asociada al espacio activo.");
          return;
        }

        if (clinicPlanBlocked) {
          setError(
            "Para crear turnos del consultorio necesitás una suscripción activa del Plan Consultorio.",
          );
          return;
        }

        if (isClinicAdmin && clinicProfessionals.length === 0) {
          setError(
            "Todavía no tenés profesionales activos. Cuando el profesional acepte la invitación, vas a poder asignarle turnos.",
          );
          return;
        }

        const selectedProfessional = isClinicProfessional
          ? clinicProfessionals.find(
              (professional) => professional.professional_id === user?.id,
            )
          : clinicProfessionals.find(
              (professional) => professional.id === selectedClinicProfessionalId,
            );

        if (!manualDateEntry && !selectedSlotStart) {
          setError(
            "Elegí un horario disponible o cargá la fecha y hora manualmente.",
          );
          return;
        }

        if (!selectedProfessional?.professional_id) {
          setError("Seleccioná un profesional vinculado al consultorio.");
          return;
        }

        if (!professionalMatchesAvailability(selectedProfessional, appointment)) {
          setError(
            "El profesional seleccionado no atiende en este día/horario según su disponibilidad configurada.",
          );
          return;
        }

        const { getSupabaseClient } = await import("@/lib/supabase");
        const supabase = getSupabaseClient();
        let clinicProfessionalId = selectedProfessional.id;
        const { data: clinicProfessionalLink } = await supabase
          .from("clinic_professionals")
          .select("id")
          .eq("clinic_id", selectedProfessional.clinic_id)
          .eq("professional_id", selectedProfessional.professional_id)
          .eq("status", "active")
          .maybeSingle();

        if ((clinicProfessionalLink as { id?: string } | null)?.id) {
          clinicProfessionalId = (clinicProfessionalLink as { id: string }).id;
        }

        await addClinicAppointment({
          ...appointment,
          allowsSimultaneous: effectiveAllowsSimultaneous,
          attentionTypeId: selectedAttentionType?.id ?? null,
          attentionTypeName: selectedAttentionType?.name ?? null,
          clinicId: selectedProfessional.clinic_id,
          clinicProfessionalId,
          professionalId: selectedProfessional.professional_id,
          sessionAmount,
          paymentType,
          insuranceProviderId:
            paymentType === "OBRA_SOCIAL" ? insuranceProviderId || null : null,
          artProviderId: paymentType === "ART" ? artProviderId || null : null,
          insuranceMemberNumber:
            paymentType === "OBRA_SOCIAL" || paymentType === "ART"
              ? insuranceMemberNumber || null
              : null,
        });
      } else {
        if (writeBlockMessage) {
          setError(writeBlockMessage);
          return;
        }

        if (independentPracticeBlocked) {
          setError(independentPlanMessage);
          return;
        }

        await addAppointment({
          ...appointment,
          allowsSimultaneous: effectiveAllowsSimultaneous,
          attentionTypeId: selectedAttentionType?.id ?? null,
          attentionTypeName: selectedAttentionType?.name ?? null,
          sessionAmount,
          paymentType,
          insuranceProviderId:
            paymentType === "OBRA_SOCIAL" ? insuranceProviderId || null : null,
          artProviderId: paymentType === "ART" ? artProviderId || null : null,
          insuranceMemberNumber:
            paymentType === "OBRA_SOCIAL" || paymentType === "ART"
              ? insuranceMemberNumber || null
              : null,
        });
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

  // Campos del formulario: el orden cambia entre clínica y particular.
  const dateField = (
    <label className="block">
      <FieldLabel required>Fecha</FieldLabel>
      <input
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
        onChange={(event) => {
          setSelectedSlotStart("");
          updateField("date", event.target.value);
        }}
        required
        type="date"
        value={appointment.date}
      />
    </label>
  );
  const timeField = (
    <label className="block">
      <FieldLabel required>Hora</FieldLabel>
      <input
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
        onChange={(event) => {
          setSelectedSlotStart("");
          updateField("time", event.target.value);
        }}
        required
        type="time"
        value={appointment.time}
      />
    </label>
  );
  const legacyProfessionalField = isClinicAdmin ? (
    <label className="block md:col-span-2">
      <FieldLabel required>Profesional</FieldLabel>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
        disabled={!canChangeClinicProfessional}
        onChange={(event) => {
          hasManuallySelectedProfessionalRef.current = true;
          setSelectedClinicProfessionalId(event.target.value);
        }}
        required
        value={selectedClinicProfessionalId}
      >
        <option value="">Seleccionar profesional vinculado</option>
        {availableClinicProfessionals.map((professional) => {
          const profile = Array.isArray(professional.profiles)
            ? professional.profiles[0]
            : professional.profiles;
          const clinic = Array.isArray(professional.clinics)
            ? professional.clinics[0]
            : professional.clinics;

          return (
            <option key={professional.id} value={professional.id}>
              {profile?.full_name ?? "Profesional"} ·{" "}
              {clinic?.name ?? "Consultorio"}
            </option>
          );
        })}
      </select>
      {professionalAvailabilityNotice ? (
        <p className="mt-2 text-sm text-amber-700">
          {professionalAvailabilityNotice}
        </p>
      ) : null}
    </label>
  ) : null;
  const patientField = (
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
  );
  const treatmentField = (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">
        Tratamiento
      </span>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        disabled={!appointment.patientId || isRefreshingTreatments}
        onChange={(event) => updateTreatment(event.target.value)}
        value={appointment.treatmentId}
      >
        <option value="">
          {isRefreshingTreatments
            ? "Cargando tratamientos..."
            : "Sin tratamiento"}
        </option>
        {isRefreshingTreatments
          ? null
          : activeTreatments.map((treatment) => (
              <option key={treatment.id} value={treatment.id}>
                {treatment.diagnosis}
                {treatment.bodyRegion
                  ? ` · ${treatment.bodyRegion}`
                  : ""}{" "}
                ({treatment.usedSessions}/{treatment.totalSessions}{" "}
                sesiones)
              </option>
            ))}
      </select>
      {!appointment.patientId && !isRefreshingTreatments ? (
        <p className="mt-2 text-sm text-slate-500">
          Elegí un paciente para ver sus tratamientos activos.
        </p>
      ) : null}
      {isRefreshingTreatments ? (
        <p className="mt-2 text-sm text-ocean-700">
          Cargando tratamientos...
        </p>
      ) : null}
      {appointment.patientId &&
      !isRefreshingTreatments &&
      activeTreatments.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          Este paciente no tiene tratamientos activos. Creá uno desde
          su{" "}
          <Link
            className="font-semibold text-ocean-700 underline-offset-4 hover:underline"
            href={`/dashboard/pacientes/${appointment.patientId}`}
            prefetch={false}
          >
            ficha
          </Link>
          .
        </p>
      ) : null}
    </label>
  );
  const attentionTypeField = attentionTypes.length > 0 ? (
    <label className={isClinicWorkspace ? "block" : "block md:col-span-2"}>
      <span className="text-sm font-semibold text-slate-700">
        Tipo de atención
      </span>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
        onChange={(event) => selectAttentionType(event.target.value)}
        value={attentionTypeId}
      >
        <option value="">Sin especificar</option>
        {attentionTypes.map((type) => (
          <option key={type.id} value={type.id}>
            {type.name} · {type.durationMinutes} min
          </option>
        ))}
      </select>
      {selectedAttentionType ? (
        <p className="mt-1 text-sm font-semibold text-slate-600">
          Duración: {selectedAttentionType.durationMinutes} min
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-500">
          Ej.: RPG, ATM, Kinesiología general. Completa la duración y
          el precio automáticamente.
        </p>
      )}
    </label>
  ) : null;
  // Con tipo de atención elegido, la duración sale del tipo (no se edita acá).
  const durationField = selectedAttentionType ? null : (
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
        {APPOINTMENT_DURATION_OPTIONS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes} min
          </option>
        ))}
      </select>
    </label>
  );
  const modalityField = (
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
  );
  const costField = (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">
        Costo de la sesión
      </span>
      <input
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
        inputMode="decimal"
        min={0}
        onChange={(event) =>
          setSessionAmount(
            event.target.value === ""
              ? null
              : Number(event.target.value),
          )
        }
        placeholder="0"
        type="number"
        value={sessionAmount ?? ""}
      />
    </label>
  );

  const simultaneousField = showSimultaneousToggle ? (
    <label
      className={`flex items-start gap-3 rounded-lg border border-ocean-100 p-4 ${
        isClinicWorkspace ? "md:col-span-2" : "mt-4"
      }`}
    >
      <input
        checked={allowsSimultaneous}
        className="mt-0.5 h-4 w-4 rounded border-ocean-200 text-ocean-600 focus:ring-ocean-400"
        onChange={(event) => setAllowsSimultaneous(event.target.checked)}
        type="checkbox"
      />
      <span>
        <span className="block text-sm font-semibold text-slate-700">
          Turno simultáneo
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          Permite que otros turnos simultáneos compartan este horario
          (hasta {simultaneousCapacity}).
        </span>
      </span>
    </label>
  ) : null;

  // --- Clínica: profesional primero y horarios libres -----------------------
  const slotFilterProfessionals = clinicProfessionals.map((professional) => {
    const profile = Array.isArray(professional.profiles)
      ? professional.profiles[0]
      : professional.profiles;

    return {
      id: professional.id,
      name: profile?.full_name ?? professional.professional_email.split("@")[0] ?? "Profesional",
    };
  });
  const selectedSlot =
    availableSlots.find((slot) => slot.start === selectedSlotStart) ?? null;
  const assignedSlotProfessional = selectedSlot?.professionals.find(
    (professional) => professional.clinicProfessionalId === selectedClinicProfessionalId,
  );

  // Elegir un horario completa fecha, hora y profesional en el estado del
  // formulario, así el guardado y la validación de conflictos no cambian.
  function selectSlot(
    slot: PickerSlot,
    professional: PickerSlot["professionals"][number] = slot.professionals[0],
  ) {
    if (!professional) {
      return;
    }

    hasManuallySelectedProfessionalRef.current = true;
    setSelectedSlotStart(slot.start);
    setSelectedClinicProfessionalId(professional.clinicProfessionalId);
    setAppointment((current) => ({ ...current, date: slot.date, time: slot.startTime }));
  }

  function changeSlotProfessionalFilter(value: string) {
    setSlotProfessionalFilter(value);

    if (value !== "any") {
      hasManuallySelectedProfessionalRef.current = true;
      setSelectedClinicProfessionalId(value);
    }
  }

  const slotProfessionalFilterField = isClinicAdmin ? (
    <label className="block">
      <FieldLabel required>Profesional</FieldLabel>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
        onChange={(event) => changeSlotProfessionalFilter(event.target.value)}
        value={slotProfessionalFilter}
      >
        <option value="any">Sin preferencia</option>
        {slotFilterProfessionals.map((professional) => (
          <option key={professional.id} value={professional.id}>
            {professional.name}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const clinicSlotsField = (
    <div className="md:col-span-2">
      {slotsError ? (
        <Alert className="mb-3" tone="error">
          {slotsError} Podés cargar la fecha y hora manualmente.
        </Alert>
      ) : null}
      <SlotPicker
        holidays={slotHolidays}
        loading={slotsLoading}
        onSelect={(slot) => selectSlot(slot)}
        onWeekChange={setSlotWeekStart}
        selected={selectedSlotStart || null}
        showProfessionalCount={slotQueryProfessional === "any"}
        slots={availableSlots}
        weekStart={slotWeekStart}
      />
      {selectedSlot && slotQueryProfessional === "any" && selectedSlot.professionals.length > 1 ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-700">
            ¿Con qué profesional?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {selectedSlot.professionals.map((professional) => {
              const chosen = professional.clinicProfessionalId === selectedClinicProfessionalId;

              return (
                <button
                  className={
                    chosen
                      ? "inline-flex min-h-9 items-center rounded-full bg-ocean-600 px-3 text-sm font-semibold text-white"
                      : "inline-flex min-h-9 items-center rounded-full border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  }
                  key={professional.clinicProfessionalId}
                  onClick={() => selectSlot(selectedSlot, professional)}
                  type="button"
                >
                  {professional.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {selectedSlot && assignedSlotProfessional ? (
        <p className="mt-3 rounded-lg bg-ocean-50 px-3 py-2 text-sm font-semibold text-ocean-900">
          {new Date(`${selectedSlot.date}T12:00:00`).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "long",
            weekday: "long",
          })}{" "}
          a las {selectedSlot.startTime} con {assignedSlotProfessional.name}
        </p>
      ) : null}
      <button
        className="mt-3 text-sm font-semibold text-ocean-700 underline-offset-4 hover:underline"
        onClick={() => setManualDateEntry((current) => !current)}
        type="button"
      >
        {manualDateEntry ? "Ocultar carga manual" : "Cargar fecha y hora manualmente"}
      </button>
      {manualDateEntry ? (
        <div className="mt-3 rounded-lg border border-ocean-100 p-4">
          <p className="text-sm text-slate-500">
            Solo para casos puntuales. El turno igual tiene que respetar la
            disponibilidad y el cupo del profesional.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {dateField}
            {timeField}
            {slotQueryProfessional === "any" ? legacyProfessionalField : null}
          </div>
        </div>
      ) : null}
    </div>
  );

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
              Programar un turno
            </h1>
            <p className="mt-2 text-slate-600">
              Completá los datos del turno.
            </p>
          </header>

          {independentPracticeBlocked ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              {independentPlanMessage}
            </section>
          ) : null}

          {isClinicAdmin && clinicProfessionals.length === 0 ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              <p>
                Para crear un turno, primero tenés que agregar un profesional al
                consultorio y esperar que acepte la invitación.
              </p>
              {activeWorkspace?.role === "ADMIN" ? (
                <Link
                  className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700"
                  href="/dashboard/equipo"
                >
                  Agregar profesional
                </Link>
              ) : null}
            </section>
          ) : null}

          {clinicPlanBlocked ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              Para crear turnos del consultorio necesitás una suscripción activa
              del Plan Consultorio.
            </section>
          ) : null}

          {!canCreateClinicSchedule ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              No tenés permisos para crear turnos de la clínica.
            </section>
          ) : null}

          {writeBlockMessage ? (
            <section className="mt-4 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800 sm:mt-6 sm:p-5">
              <p>{writeBlockMessage}</p>
              <Link
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                href="/dashboard/planes"
              >
                Ver planes
              </Link>
            </section>
          ) : null}

          <form
            className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:mt-6 sm:p-5"
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {isClinicWorkspace ? (
                <>
                  {patientField}
                  {treatmentField}
                  {slotProfessionalFilterField}
                  {attentionTypeField ?? durationField}
                  {attentionTypeField ? durationField : null}
                  {simultaneousField}
                  {clinicSlotsField}
                  {modalityField}
                  {costField}
                </>
              ) : (
                <>
                  {dateField}
                  {timeField}
                  {legacyProfessionalField}
                  {patientField}
                  {treatmentField}
                  {attentionTypeField}
                  {durationField}
                  {modalityField}
                  {costField}
                </>
              )}
            </div>

            {isClinicWorkspace ? null : simultaneousField}

            {activeInsuranceProviders.length > 0 || activeArtProviders.length > 0 ? (
              <div className="mt-4 rounded-lg border border-ocean-100 p-4">
                <span className="text-sm font-semibold text-slate-700">
                  ¿Cómo paga el paciente?
                </span>
                <div className="mt-2 flex gap-4">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      checked={paymentType === "PARTICULAR"}
                      className="h-4 w-4 border-ocean-200 text-ocean-600 focus:ring-ocean-400"
                      name="paymentType"
                      onChange={() => selectPaymentType("PARTICULAR")}
                      type="radio"
                    />
                    Particular
                  </label>
                  {activeInsuranceProviders.length > 0 ? (
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        checked={paymentType === "OBRA_SOCIAL"}
                        className="h-4 w-4 border-ocean-200 text-ocean-600 focus:ring-ocean-400"
                        name="paymentType"
                        onChange={() => selectPaymentType("OBRA_SOCIAL")}
                        type="radio"
                      />
                      Obra social
                    </label>
                  ) : null}
                  {activeArtProviders.length > 0 ? (
                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        checked={paymentType === "ART"}
                        className="h-4 w-4 border-ocean-200 text-ocean-600 focus:ring-ocean-400"
                        name="paymentType"
                        onChange={() => selectPaymentType("ART")}
                        type="radio"
                      />
                      ART
                    </label>
                  ) : null}
                </div>

                {paymentType === "OBRA_SOCIAL" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        Obra social
                      </span>
                      <select
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) => {
                          setInsuranceProviderId(event.target.value);
                          recalculateSessionAmount({
                            insuranceProviderId: event.target.value,
                          });
                        }}
                        value={insuranceProviderId}
                      >
                        <option value="">Seleccionar obra social</option>
                        {activeInsuranceProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        Número de afiliado
                      </span>
                      <input
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          setInsuranceMemberNumber(event.target.value)
                        }
                        required={Boolean(insuranceProviderId)}
                        value={insuranceMemberNumber}
                      />
                    </label>
                  </div>
                ) : null}

                {paymentType === "ART" ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        ART
                      </span>
                      <select
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) => {
                          setArtProviderId(event.target.value);
                          recalculateSessionAmount({
                            artProviderId: event.target.value,
                          });
                        }}
                        value={artProviderId}
                      >
                        <option value="">Seleccionar ART</option>
                        {activeArtProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm font-semibold text-slate-700">
                        Número de afiliado/credencial ART
                      </span>
                      <input
                        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                        onChange={(event) =>
                          setInsuranceMemberNumber(event.target.value)
                        }
                        required={Boolean(artProviderId)}
                        value={insuranceMemberNumber}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

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

            {appointmentConflict?.kind === "exclusive" ? (
              <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:mt-5">
                {appointmentConflict.reason === "new_exclusive"
                  ? "Ya hay un turno en ese horario. Si esta sesión se puede superponer, marcala como turno simultáneo."
                  : "En ese horario hay un turno que no admite simultáneos."}
              </p>
            ) : appointmentConflict?.kind === "capacity" ? (
              <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:mt-5">
                Ya tenés {appointmentConflict.count}{" "}
                {appointmentConflict.count === 1 ? "turno" : "turnos"} en ese
                horario y alcanzaste el cupo de turnos simultáneos.
              </p>
            ) : appointmentConflict?.kind === "other_workspace" ? (
              <p className="mt-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 sm:mt-5">
                Ese horario se superpone con un turno de{" "}
                {appointmentConflict.appointment.patient} a las{" "}
                {appointmentConflict.appointment.time} en otro consultorio.
              </p>
            ) : appointmentConflict?.kind === "none" &&
              effectiveAllowsSimultaneous &&
              appointmentConflict.simultaneousCount > 0 ? (
              <p className="mt-4 text-sm font-medium text-slate-500 sm:mt-5">
                Turno simultáneo ({appointmentConflict.simultaneousCount + 1} de{" "}
                {appointmentConflict.capacity})
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
                  Boolean(writeBlockMessage) ||
                  independentPracticeBlocked ||
                  clinicPlanBlocked ||
                  !canCreateClinicSchedule ||
                  (isClinicAdmin && clinicProfessionals.length === 0)
                }
                title={writeBlockMessage ?? undefined}
                type="submit"
              >
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar turno"}
              </button>
            </div>
          </form>

        </div>
      </section>
    </main>
  );
}

