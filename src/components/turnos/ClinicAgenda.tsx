"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRightLeft,
  CalendarX,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Plus,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { PageContainer } from "@/components/layout/PageContainer";
import { ClinicBookingPanel } from "@/components/turnos/ClinicBookingPanel";
import { AppointmentPaymentModal } from "@/components/turnos/AppointmentPaymentModal";
import { UndoToast } from "@/components/ui/UndoToast";
import { useAccessLevel } from "@/hooks/useAccessLevel";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import {
  type Appointment,
  type AppointmentPaymentInput,
  useAppointments,
} from "@/hooks/useAppointments";
import { useWorkspaceMedicalOrders } from "@/hooks/useMedicalOrders";
import { MedicalOrderChip } from "@/components/turnos/MedicalOrderChip";
import { useAttentionTypes } from "@/hooks/useAttentionTypes";
import { isFutureAppointment, useAttendanceActions } from "@/hooks/useAttendanceActions";
import { useCanSeeAmounts } from "@/hooks/useCanSeeAmounts";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import { usePatients } from "@/hooks/usePatients";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import {
  appointmentStatusStyles,
  getAppointmentDisplayStatus,
} from "@/lib/appointment-ui";
import {
  type AgendaSlot,
  type DayLevel,
  availabilityRange,
  buildDayRows,
  buildMonthGrid,
  dayLevelLabels,
  isVisibleAgendaAppointment,
  monthDateValues,
  shiftMonth,
  summarizeDays,
  upcomingSlots,
} from "@/lib/clinic-agenda";
import { toArgentinaDateValue } from "@/lib/dates";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import {
  formatCurrency,
  getCoverageLabel,
  isPatientPaidAppointment,
  paymentStatusStyles,
} from "@/lib/payment-ui";
import {
  DEFAULT_SESSION_DURATION_MINUTES,
  DEFAULT_SESSION_PRICE,
} from "@/lib/session-defaults";

type ClinicProfessional = {
  id: string;
  name: string;
  professionalId: string;
};

const WEEKDAY_HEADERS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const READ_ONLY_MESSAGE =
  "Tu período de prueba gratuita venció. Activá un plan para seguir gestionando pacientes.";

const dotClasses: Record<DayLevel, string> = {
  feriado: "bg-transparent",
  libre: "bg-[#1565FF]",
  lleno: "bg-slate-400",
  pasado: "bg-transparent",
  poco: "bg-[#E8833A]",
  sin_atencion: "bg-transparent",
};

const hatchedBackground =
  "bg-[repeating-linear-gradient(45deg,#F1F5F9_0_3px,#FFFFFF_3px_6px)]";

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMonthTitle(year: number, month: number) {
  return capitalizeFirst(
    new Date(Date.UTC(year, month, 15)).toLocaleDateString("es-AR", {
      month: "long",
      timeZone: "UTC",
      year: "numeric",
    }),
  );
}

function formatDayTitle(dateValue: string) {
  return capitalizeFirst(
    new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      weekday: "long",
    }),
  );
}

function parseMonth(dateValue: string) {
  const [year, month] = dateValue.split("-").map(Number);

  return { month: month - 1, year };
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Agenda de la clínica para el staff (admin y recepción): calendario del mes
 * coloreado por lugar disponible, lista del día con turnos dados y horarios
 * libres, y "Dar turno" en el mismo lugar. Los horarios libres salen de
 * /api/appointments/availability (misma lógica que Nuevo turno y la reserva
 * online).
 */
export function ClinicAgenda() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const canSeeAmounts = useCanSeeAmounts();
  const { isReadOnly, loaded: accessLoaded } = useAccessLevel();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const { activePatients, addPatient } = usePatients({ withStats: false });
  const { attentionTypes } = useAttentionTypes();
  const { providers: insuranceProviders } = useInsuranceProviders();
  const {
    addClinicAppointment,
    appointments,
    error: appointmentsError,
    initialLoaded,
    rescheduleAppointment,
    updateAppointmentPayment,
    updateAppointmentStatus,
  } = useAppointments();
  const medicalOrders = useWorkspaceMedicalOrders();
  const refreshMedicalOrders = medicalOrders.refresh;
  useEffect(() => {
    if (initialLoaded) {
      void refreshMedicalOrders();
    }
  }, [appointments, initialLoaded, refreshMedicalOrders]);

  const [today, setToday] = useState(() => toArgentinaDateValue());
  const [now, setNow] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [{ month, year }, setVisibleMonth] = useState(() => parseMonth(today));
  const [professionals, setProfessionals] = useState<ClinicProfessional[]>([]);
  const [professionalFilter, setProfessionalFilter] = useState("any");
  const [attentionTypeId, setAttentionTypeId] = useState("");
  const [slots, setSlots] = useState<AgendaSlot[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [bookingSlot, setBookingSlot] = useState<AgendaSlot | null>(null);
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [menuId, setMenuId] = useState("");
  const [paying, setPaying] = useState<Appointment | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const stripRef = useRef<HTMLDivElement>(null);

  // "Ahora" (horarios que ya pasaron, turnos sin asistencia) se actualiza solo.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      setToday(toArgentinaDateValue());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  const workspaceId = activeWorkspace?.id ?? "";
  const clinicId = activeWorkspace?.sourceClinicId ?? "";

  useEffect(() => {
    if (!clinicId) {
      return;
    }

    let cancelled = false;

    async function loadProfessionals() {
      const { getSupabaseClient } = await import("@/lib/supabase");
      const { data } = await getSupabaseClient()
        .from("clinic_professionals")
        .select("id, professional_id, professional_email, profiles(full_name)")
        .eq("clinic_id", clinicId)
        .eq("status", "active")
        .not("professional_id", "is", null);

      if (cancelled) {
        return;
      }

      type Row = {
        id: string;
        professional_email: string;
        professional_id: string;
        profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
      };
      setProfessionals(
        ((data ?? []) as unknown as Row[])
          .map((row) => {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

            return {
              id: row.id,
              name: profile?.full_name?.trim() || row.professional_email,
              professionalId: row.professional_id,
            };
          })
          .sort((left, right) => left.name.localeCompare(right.name, "es")),
      );
    }

    void loadProfessionals();

    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  const attentionType =
    attentionTypes.find((type) => type.id === attentionTypeId) ?? null;
  const defaultDurationMinutes =
    activeWorkspace?.defaultSessionDurationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES;
  const durationMinutes = attentionType?.durationMinutes ?? defaultDurationMinutes;
  // Igual que Nuevo turno en una clínica: simultáneo salvo que el tipo de
  // atención diga lo contrario.
  const allowsSimultaneous = attentionType?.allowsSimultaneous ?? true;
  // Al reprogramar se buscan lugares del profesional del turno.
  const queryProfessional = moving?.clinicProfessionalId ?? professionalFilter;
  const range = availabilityRange(year, month, today);
  const rangeFrom = range?.from ?? "";
  const rangeTo = range?.to ?? "";

  // Horarios libres del mes visible: un pedido por mes (el endpoint acepta
  // hasta 31 días). Se vuelve a pedir después de dar, mover o cancelar.
  useEffect(() => {
    if (!workspaceId || !rangeFrom) {
      setSlots([]);
      setHolidays([]);
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
          allowsSimultaneous: String(allowsSimultaneous),
          durationMinutes: String(durationMinutes),
          from: rangeFrom,
          professionalId: queryProfessional,
          to: rangeTo,
          workspaceId,
        });
        const response = await fetch(`/api/appointments/availability?${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
        const result = (await response.json().catch(() => ({}))) as {
          error?: string;
          holidays?: string[];
          slots?: AgendaSlot[];
        };

        if (!response.ok) {
          throw new Error(result.error ?? "No pudimos cargar los horarios.");
        }

        setSlots(result.slots ?? []);
        setHolidays(result.holidays ?? []);
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setSlots([]);
        setSlotsError(
          getFriendlyErrorMessage(loadError, "No pudimos cargar los horarios disponibles."),
        );
      } finally {
        if (!controller.signal.aborted) {
          setSlotsLoading(false);
        }
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    allowsSimultaneous,
    availabilityVersion,
    durationMinutes,
    queryProfessional,
    rangeFrom,
    rangeTo,
    workspaceId,
  ]);

  const filterProfessional = professionals.find((item) => item.id === professionalFilter);
  const visibleAppointments = useMemo(
    () =>
      appointments.filter(
        (appointment) =>
          isVisibleAgendaAppointment(appointment) &&
          (!filterProfessional ||
            appointment.clinicProfessionalId === filterProfessional.id ||
            appointment.ownerId === filterProfessional.professionalId),
      ),
    [appointments, filterProfessional],
  );
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();

    for (const appointment of visibleAppointments) {
      const date = toArgentinaDateValue(new Date(appointment.scheduledAt));
      map.set(date, [...(map.get(date) ?? []), appointment]);
    }

    return map;
  }, [visibleAppointments]);
  const openSlots = useMemo(() => {
    const upcoming = upcomingSlots(slots, now);

    // Al mover un turno, solo los horarios de su profesional.
    return moving
      ? upcoming
          .filter((slot) =>
            slot.professionals.some((item) => item.professionalId === moving.ownerId),
          )
          .map((slot) => ({
            ...slot,
            professionals: slot.professionals.filter(
              (item) => item.professionalId === moving.ownerId,
            ),
          }))
      : upcoming;
  }, [moving, now, slots]);
  const monthDates = useMemo(() => monthDateValues(year, month), [month, year]);
  const daySummaries = useMemo(
    () =>
      summarizeDays({
        appointmentDates: monthDates.flatMap((date) =>
          (appointmentsByDate.get(date) ?? []).map(() => date),
        ),
        dates: monthDates,
        holidays,
        slots: openSlots,
        today,
      }),
    [appointmentsByDate, holidays, monthDates, openSlots, today],
  );
  const dayAppointments = appointmentsByDate.get(selectedDate) ?? [];
  const daySlots = openSlots.filter((slot) => slot.date === selectedDate);
  const rows = buildDayRows(dayAppointments, daySlots);
  const unregisteredCount = dayAppointments.filter(
    (appointment) => getAppointmentDisplayStatus(appointment) === "Sin registrar asistencia",
  ).length;
  const daySummary = daySummaries.get(selectedDate);

  const ready =
    !loading && workspaceLoaded && accessLoaded && planLoaded && initialLoaded;

  // En el celular, el día elegido queda centrado en la tira.
  useEffect(() => {
    const strip = stripRef.current;
    const button = strip?.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`);

    if (strip && button) {
      const offset =
        button.getBoundingClientRect().left - strip.getBoundingClientRect().left;
      strip.scrollTo({
        left: strip.scrollLeft + offset - (strip.clientWidth - button.clientWidth) / 2,
      });
    }
  }, [ready, selectedDate, month, year]);

  // Cierra el menú de acciones al tocar afuera.
  useEffect(() => {
    if (!menuId) {
      return;
    }

    function handleClick(event: MouseEvent) {
      if (!(event.target as HTMLElement).closest("[data-row-menu]")) {
        setMenuId("");
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuId]);

  const clinicPlanBlocked =
    plan.plan !== "FREE" && !(plan.estadoPlan === "ACTIVO" && plan.plan === "CONSULTORIO");
  const writeBlockMessage = isReadOnly
    ? READ_ONLY_MESSAGE
    : clinicPlanBlocked
      ? "Para crear turnos del consultorio necesitás una suscripción activa del Plan Consultorio."
      : null;

  const attendance = useAttendanceActions({
    getWriteBlockMessage: () => (isReadOnly ? READ_ONLY_MESSAGE : null),
    isProfessionalClinicAppointment: () => false,
    onAttended: (appointment) => {
      if (isPatientPaidAppointment(appointment) && appointment.paymentStatus === "pending") {
        setPaying(appointment);
      }
    },
    onUndone: (appointment) => {
      setPaying((current) => (current?.id === appointment.id ? null : current));
    },
    updateAppointmentStatus,
  });

  const refreshAvailability = useCallback(
    () => setAvailabilityVersion((version) => version + 1),
    [],
  );

  function selectDate(date: string) {
    setSelectedDate(date);
    setBookingSlot(null);
  }

  function changeMonth(delta: number) {
    const next = shiftMonth(year, month, delta);
    setVisibleMonth(next);
    setBookingSlot(null);
    const current = parseMonth(today);
    // El mes actual abre en hoy; los demás, en el día 1.
    selectDate(
      next.year === current.year && next.month === current.month
        ? today
        : monthDateValues(next.year, next.month)[0],
    );
  }

  function goToToday() {
    setVisibleMonth(parseMonth(today));
    selectDate(today);
  }

  async function handleMove(slot: AgendaSlot) {
    if (!moving) {
      return;
    }

    setActionBusy(true);
    setActionError("");

    try {
      await rescheduleAppointment(moving.id, slot.date, slot.startTime);
      setNotice(`${moving.patient}: turno movido al ${formatDayTitle(slot.date).toLowerCase()} ${slot.startTime}`);
      setMoving(null);
      refreshAvailability();
    } catch (moveError) {
      setActionError(getFriendlyErrorMessage(moveError, "No pudimos mover el turno."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelling) {
      return;
    }

    setActionBusy(true);
    setActionError("");

    try {
      await updateAppointmentStatus(cancelling.id, "cancelled");
      setNotice(`${cancelling.patient}: turno cancelado`);
      setCancelling(null);
      refreshAvailability();
    } catch (cancelError) {
      setActionError(getFriendlyErrorMessage(cancelError, "No pudimos cancelar el turno."));
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePaymentSubmit(input: AppointmentPaymentInput) {
    if (!paying) {
      return;
    }

    setSavingPayment(true);
    setActionError("");

    try {
      await updateAppointmentPayment(paying.id, input);
      setPaying(null);
    } catch (paymentError) {
      setActionError(getFriendlyErrorMessage(paymentError, "No pudimos guardar el cobro."));
    } finally {
      setSavingPayment(false);
    }
  }

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

  if (!ready) {
    return <DashboardLoading />;
  }

  const error = actionError || attendance.error || appointmentsError;
  const selectClassName =
    "min-h-11 w-full rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-ocean-400";
  const showProfessionalNames = professionalFilter === "any";
  // Con el panel de "Dar turno" abierto la lista es angosta: las acciones van
  // debajo del paciente.
  const wideRows = !bookingSlot;

  function renderBusyRow(appointment: Appointment) {
    const status = getAppointmentDisplayStatus(appointment);
    const future = isFutureAppointment(appointment);
    const busy = attendance.updatingId === appointment.id;
    const attended = status === "Asistió";
    const showAttendance = !future && !attended && status !== "No asistió";
    const chargeable = isPatientPaidAppointment(appointment);
    const detail = [
      showProfessionalNames ? appointment.professionalName : null,
      appointment.attentionTypeName,
    ]
      .filter(Boolean)
      .join(" · ");

    return (
      <div
        className={`flex flex-col gap-2 rounded-lg border bg-white px-3 py-2.5 ${
          wideRows ? "xl:flex-row xl:items-center" : ""
        } ${
          moving?.id === appointment.id ? "border-ocean-500 ring-2 ring-ocean-200" : "border-ocean-100"
        }`}
        key={appointment.id}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="w-12 shrink-0 pt-0.5 text-sm font-bold text-ink">
            {appointment.time}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              className="block truncate font-semibold text-ink underline-offset-4 hover:text-ocean-700 hover:underline"
              href={`/dashboard/pacientes/${appointment.patientId}`}
              prefetch={false}
            >
              {appointment.patient}
            </Link>
            {detail ? <p className="truncate text-sm text-slate-600">{detail}</p> : null}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  appointmentStatusStyles[status] ?? "bg-slate-100 text-slate-700"
                }`}
              >
                {status}
              </span>
              {attended ? (
                chargeable ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      appointment.paymentStatus === "pending"
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                        : paymentStatusStyles[appointment.paymentStatusLabel] ??
                          "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {appointment.paymentStatus === "pending"
                      ? canSeeAmounts
                        ? `Sin cobrar · ${formatCurrency(appointment.amount)}`
                        : "Sin cobrar"
                      : appointment.paymentStatusLabel}
                  </span>
                ) : (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800 ring-1 ring-sky-200">
                    {getCoverageLabel(appointment)}
                  </span>
                )
              ) : null}
              {medicalOrders.hasOrders ? (
                <MedicalOrderChip info={medicalOrders.byAppointment.get(appointment.id)} />
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={`flex flex-wrap items-center gap-2 pl-[3.75rem] empty:hidden ${
            wideRows ? "xl:justify-end xl:pl-0" : ""
          }`}
        >
          {showAttendance ? (
            <>
              <button
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                disabled={busy}
                onClick={() => void attendance.markAttendance(appointment, "attended")}
                type="button"
              >
                <CheckCircle2 className="h-4 w-4" />
                Asistió
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                disabled={busy}
                onClick={() => void attendance.markAttendance(appointment, "no_show")}
                type="button"
              >
                <XCircle className="h-4 w-4" />
                No asistió
              </button>
            </>
          ) : null}
          {attended && chargeable && appointment.paymentStatus === "pending" ? (
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-amber-200 px-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60"
              disabled={isReadOnly}
              onClick={() => setPaying(appointment)}
              type="button"
            >
              <Wallet className="h-4 w-4" />
              Cobrar
            </button>
          ) : null}
          {future && !moving ? (
            <div className="relative" data-row-menu>
              <button
                aria-expanded={menuId === appointment.id}
                aria-label={`Acciones del turno de ${appointment.patient}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ocean-100 text-slate-600 transition hover:bg-ocean-50"
                onClick={() => setMenuId((current) => (current === appointment.id ? "" : appointment.id))}
                type="button"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {menuId === appointment.id ? (
                <div className="absolute right-0 top-11 z-20 w-52 overflow-hidden rounded-lg border border-ocean-100 bg-white py-1 shadow-soft">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-ink hover:bg-ocean-50"
                    onClick={() => {
                      setMenuId("");
                      setBookingSlot(null);
                      setMoving(appointment);
                    }}
                    type="button"
                  >
                    <ArrowRightLeft className="h-4 w-4 text-ocean-700" />
                    Mover a otro horario
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"
                    onClick={() => {
                      setMenuId("");
                      setCancelling(appointment);
                    }}
                    type="button"
                  >
                    <CalendarX className="h-4 w-4" />
                    Cancelar turno
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderFreeRow(slot: AgendaSlot) {
    const names = slot.professionals.map((item) => item.name).join(", ");
    const selected = bookingSlot?.start === slot.start;

    return (
      <div
        className={`flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 ${
          selected ? "border-ocean-500 bg-ocean-50" : "border-ocean-200 bg-[#FAFCFF]"
        }`}
        key={`free-${slot.start}`}
      >
        <span className="w-12 shrink-0 text-sm font-bold text-ocean-800">{slot.startTime}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600" title={names}>
          <span className="font-semibold text-slate-700">Libre</span>
          {showProfessionalNames && !moving ? (
            <>
              {" · "}
              {plural(slot.professionals.length, "lugar", "lugares")}
              {wideRows ? <span className="hidden xl:inline"> · {names}</span> : null}
            </>
          ) : null}
        </span>
        {moving ? (
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ocean-600 px-3 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
            disabled={actionBusy}
            onClick={() => void handleMove(slot)}
            type="button"
          >
            Mover acá
          </button>
        ) : (
          <button
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-ocean-600 px-3 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
            disabled={Boolean(writeBlockMessage)}
            onClick={() => setBookingSlot(slot)}
            title={writeBlockMessage ?? undefined}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Dar turno
          </button>
        )}
      </div>
    );
  }

  const calendarCells = buildMonthGrid(year, month);

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer maxWidth="full">
        <header className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Agenda de la clínica</p>
              <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">Dar y ver turnos</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:flex xl:items-end">
              <label
                className={`block xl:w-60 ${attentionTypes.length > 0 ? "" : "col-span-2 sm:col-span-1"}`}
              >
                <span className="text-xs font-semibold text-slate-600">Profesional</span>
                <select
                  className={`mt-1 ${selectClassName}`}
                  onChange={(event) => {
                    setProfessionalFilter(event.target.value);
                    setBookingSlot(null);
                  }}
                  value={professionalFilter}
                >
                  <option value="any">Todos</option>
                  {professionals.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {attentionTypes.length > 0 ? (
                <label className="block xl:w-60">
                  <span className="text-xs font-semibold text-slate-600">Tipo de atención</span>
                  <select
                    className={`mt-1 ${selectClassName}`}
                    onChange={(event) => {
                      setAttentionTypeId(event.target.value);
                      setBookingSlot(null);
                    }}
                    value={attentionTypeId}
                  >
                    <option value="">Sin especificar · {defaultDurationMinutes} min</option>
                    {attentionTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name} · {type.durationMinutes} min
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Link
                className="col-span-2 inline-flex min-h-10 items-center justify-end rounded-lg px-1 text-sm font-semibold text-ocean-700 hover:text-ocean-900 xl:min-h-11 xl:justify-center xl:px-3 xl:hover:bg-ocean-50"
                href="/dashboard/turnos?vista=anterior"
                prefetch={false}
              >
                Vista anterior
              </Link>
            </div>
          </div>
        </header>

        {moving ? (
          <div className="sticky top-16 z-30 mt-4 flex flex-col gap-2 rounded-lg border border-ocean-300 bg-ocean-600 px-4 py-3 text-white shadow-soft sm:flex-row sm:items-center sm:justify-between lg:top-4">
            <p className="text-sm font-semibold">
              Elegí el nuevo horario para {moving.patient}
              {moving.professionalName ? ` (${moving.professionalName})` : ""}.
            </p>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-white/15 px-3 text-sm font-semibold hover:bg-white/25"
              onClick={() => setMoving(null)}
              type="button"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <div
          className={`mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[19rem_minmax(0,1fr)] ${
            bookingSlot ? "xl:grid-cols-[19rem_minmax(0,1fr)_24rem]" : ""
          }`}
        >
          {/* Calendario del mes (en el celular, tira de días). */}
          <section className="rounded-lg border border-ocean-100 bg-white p-3 shadow-card sm:p-4 lg:self-start">
            <div className="flex items-center justify-between gap-2">
              <button
                aria-label="Mes anterior"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-ocean-50"
                onClick={() => changeMonth(-1)}
                type="button"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink">
                  {formatMonthTitle(year, month)}
                </h2>
                {slotsLoading ? <Loader2 className="h-4 w-4 animate-spin text-ocean-500" /> : null}
              </div>
              <button
                aria-label="Mes siguiente"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-ocean-50"
                onClick={() => changeMonth(1)}
                type="button"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-2 hidden grid-cols-7 gap-1 lg:grid">
              {WEEKDAY_HEADERS.map((label) => (
                <span className="py-1 text-center text-xs font-semibold text-slate-500" key={label}>
                  {label}
                </span>
              ))}
              {calendarCells.map((date, index) => {
                if (!date) {
                  return <span key={`empty-${index}`} />;
                }

                const summary = daySummaries.get(date);
                const level = summary?.level ?? "sin_atencion";
                const selected = date === selectedDate;
                const muted = level === "pasado" || level === "sin_atencion" || level === "lleno";

                return (
                  <button
                    aria-label={`${formatDayTitle(date)}: ${dayLevelLabels[level]}`}
                    aria-pressed={selected}
                    className={`flex h-12 flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition ${
                      selected
                        ? "border-2 border-[#0F55DC] bg-[#EEF4FF] text-ink"
                        : level === "feriado"
                          ? `border-slate-200 ${hatchedBackground} text-slate-500`
                          : muted
                            ? "border-transparent text-slate-400 hover:bg-ocean-50"
                            : "border-ocean-100 text-ink hover:border-ocean-300"
                    } ${date === today && !selected ? "ring-1 ring-ocean-400" : ""}`}
                    key={date}
                    onClick={() => selectDate(date)}
                    title={dayLevelLabels[level]}
                    type="button"
                  >
                    {Number(date.slice(8))}
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClasses[level]}`} />
                  </button>
                );
              })}
            </div>

            <div
              className="mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:hidden"
              ref={stripRef}
            >
              {monthDates.map((date) => {
                const level = daySummaries.get(date)?.level ?? "sin_atencion";
                const selected = date === selectedDate;

                return (
                  <button
                    className={`flex h-16 w-12 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border ${
                      selected
                        ? "border-[#0F55DC] bg-[#0F55DC] text-white"
                        : level === "feriado"
                          ? `border-slate-200 ${hatchedBackground} text-slate-500`
                          : level === "lleno" || level === "pasado" || level === "sin_atencion"
                            ? "border-slate-200 bg-slate-50 text-slate-500"
                            : "border-ocean-100 bg-white text-ink"
                    }`}
                    data-date={date}
                    key={date}
                    onClick={() => selectDate(date)}
                    type="button"
                  >
                    <span className="text-[0.7rem] font-bold">
                      {WEEKDAY_HEADERS[(new Date(`${date}T12:00:00`).getDay() + 6) % 7]}
                    </span>
                    <span className="text-base font-extrabold">{Number(date.slice(8))}</span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-white" : dotClasses[level]}`}
                    />
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dotClasses.libre}`} />
                Con lugar
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dotClasses.poco}`} />
                Poco lugar
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${dotClasses.lleno}`} />
                Completo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-3 w-3 rounded border border-slate-200 ${hatchedBackground}`} />
                Feriado
              </span>
            </div>
            {selectedDate !== today ? (
              <button
                className="mt-3 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
                onClick={goToToday}
                type="button"
              >
                Volver a hoy
              </button>
            ) : null}
          </section>

          {/* Lista del día: turnos dados y horarios libres. */}
          <section className="min-w-0 rounded-lg border border-ocean-100 bg-white p-3 shadow-card sm:p-4">
            <h2 className="text-lg font-bold text-ink">{formatDayTitle(selectedDate)}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-ocean-50 px-2.5 py-1 text-xs font-bold text-ocean-800">
                {plural(dayAppointments.length, "turno dado", "turnos dados")}
              </span>
              {selectedDate >= today ? (
                <span className="rounded-full bg-ocean-50 px-2.5 py-1 text-xs font-bold text-ocean-800">
                  {plural(daySlots.length, "horario libre", "horarios libres")}
                </span>
              ) : null}
              {unregisteredCount > 0 ? (
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-800">
                  {unregisteredCount} sin registrar asistencia
                </span>
              ) : null}
            </div>
            {slotsError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {slotsError}{" "}
                <Link className="font-semibold underline" href="/dashboard/turnos/nuevo" prefetch={false}>
                  Cargar un turno a mano
                </Link>
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-2">
              {rows.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-600">
                  {slotsLoading && selectedDate >= today
                    ? "Buscando horarios..."
                    : daySummary?.level === "feriado"
                      ? "Feriado: no hay horarios de atención."
                      : selectedDate < today
                        ? "No hubo turnos este día."
                        : "No hay turnos ni horarios de atención este día."}
                </p>
              ) : null}
              {rows.map((row) =>
                row.kind === "busy" ? renderBusyRow(row.appointment) : renderFreeRow(row.slot),
              )}
            </div>
            <p className="mt-4 text-xs text-slate-500">
              ¿Un horario fuera de la agenda?{" "}
              <Link className="font-semibold text-ocean-700" href="/dashboard/turnos/nuevo" prefetch={false}>
                Cargar turno a mano
              </Link>
            </p>
          </section>

          {bookingSlot && clinicId ? (
            <ClinicBookingPanel
              addClinicAppointment={addClinicAppointment}
              addPatient={addPatient}
              allowsSimultaneous={allowsSimultaneous}
              appointments={appointments}
              attentionType={attentionType}
              canSeeAmounts={canSeeAmounts}
              clinicId={clinicId}
              defaultSessionPrice={activeWorkspace?.defaultSessionPrice ?? DEFAULT_SESSION_PRICE}
              durationMinutes={durationMinutes}
              insuranceProviders={insuranceProviders}
              key={bookingSlot.start}
              onClose={() => setBookingSlot(null)}
              onSaved={(message) => {
                setBookingSlot(null);
                setNotice(message);
                refreshAvailability();
              }}
              patients={activePatients}
              slot={bookingSlot}
              workspaceId={workspaceId}
              writeBlockMessage={writeBlockMessage}
            />
          ) : null}
        </div>
      </PageContainer>

      {cancelling ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-5 shadow-soft">
            <h2 className="text-lg font-bold text-ink">¿Cancelar el turno?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {cancelling.patient} · {cancelling.date} · {cancelling.time}. El horario queda libre.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 hover:bg-ocean-50"
                onClick={() => setCancelling(null)}
                type="button"
              >
                Volver
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                disabled={actionBusy}
                onClick={() => void handleCancel()}
                type="button"
              >
                {actionBusy ? "Cancelando..." : "Cancelar turno"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {paying ? (
        <AppointmentPaymentModal
          appointment={paying}
          key={paying.id}
          onCancel={() => setPaying(null)}
          onSubmit={handlePaymentSubmit}
          saving={savingPayment}
        />
      ) : null}

      {attendance.lastChange ? (
        <UndoToast
          message={attendance.lastChange.message}
          onClose={attendance.dismissChange}
          onUndo={attendance.lastChange.previousStatus ? attendance.undoLastChange : undefined}
        />
      ) : notice ? (
        <UndoToast key={notice} message={notice} onClose={() => setNotice("")} />
      ) : null}
    </main>
  );
}
