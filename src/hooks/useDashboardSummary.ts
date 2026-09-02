"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { appointmentStatusLabels } from "@/lib/appointment-ui";
import { formatDate } from "@/lib/format";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type PatientStatus = "active" | "inactive";
type AppointmentStatus =
  | "pending"
  | "attended"
  | "cancelled"
  | "no_show"
  | "rescheduled"
  | "confirmed"
  | "completed";
type PaymentStatus = "pending" | "paid" | "waived" | "not_applicable";
type PaymentMethod = "cash" | "transfer" | "mercado_pago" | "insurance" | "other";

type DashboardPatientRow = {
  id: string;
  clinic_id: string | null;
  full_name: string;
  initial_condition: string;
  status: PatientStatus;
};

type DashboardAppointmentRow = {
  id: string;
  patient_id: string;
  scheduled_at: string;
  duration_minutes: number;
  modality: "presencial" | "domicilio" | "virtual";
  status: AppointmentStatus;
  session_amount: number | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  payment_notes: string | null;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
};

type AmountRow = {
  session_amount: number | null;
};

type ClinicProfessionalAccessRow = {
  can_view_assigned_patients: boolean;
};

type ScopedQuery = {
  eq: (column: string, value: unknown) => ScopedQuery;
  is: (column: string, value: null) => ScopedQuery;
};

export type DashboardPatient = {
  clinicId: string | null;
  condition: string;
  id: string;
  name: string;
  status: "Activo" | "Inactivo";
};

export type DashboardAppointment = {
  amount: number;
  date: string;
  durationMinutes: number;
  id: string;
  modality: string;
  paidAt: string | null;
  patient: string;
  patientId: string;
  paymentMethod: PaymentMethod | "";
  paymentMethodLabel: string;
  paymentNotes: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  scheduledAt: string;
  status: string;
  time: string;
};

export type DashboardSummary = {
  actionRequired: DashboardAppointment[];
  activePatientCount: number;
  appointmentsTodayCount: number;
  monthIncome: number;
  paymentActionRequired: DashboardAppointment[];
  pendingPaymentAmount: number;
  pendingPaymentCount: number;
  recentPatients: DashboardPatient[];
  upcomingAppointments: DashboardAppointment[];
};

const emptySummary: DashboardSummary = {
  actionRequired: [],
  activePatientCount: 0,
  appointmentsTodayCount: 0,
  monthIncome: 0,
  paymentActionRequired: [],
  pendingPaymentAmount: 0,
  pendingPaymentCount: 0,
  recentPatients: [],
  upcomingAppointments: [],
};

const modalityLabels: Record<DashboardAppointmentRow["modality"], string> = {
  domicilio: "Domicilio",
  presencial: "Presencial",
  virtual: "Virtual",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_applicable: "No corresponde",
  paid: "Cobrado",
  pending: "Pendiente",
  waived: "Bonificado",
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  insurance: "Obra social",
  mercado_pago: "Mercado Pago",
  other: "Otro",
  transfer: "Transferencia",
};

function startDevTimer(name: string) {
  if (process.env.NODE_ENV !== "development") {
    return () => {};
  }

  console.time(name);
  return () => console.timeEnd(name);
}

function debugDashboard(message: string, details?: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug(message, details ?? "");
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getPatient(
  patient: { full_name: string } | Array<{ full_name: string }> | null,
) {
  return Array.isArray(patient) ? patient[0] : patient;
}

function mapAppointment(row: DashboardAppointmentRow): DashboardAppointment {
  const date = new Date(row.scheduled_at);
  const paymentStatus = row.payment_status ?? "pending";
  const paymentMethod = row.payment_method ?? "";

  return {
    amount: Number(row.session_amount ?? 0),
    date: formatDate(date),
    durationMinutes: row.duration_minutes,
    id: row.id,
    modality: modalityLabels[row.modality],
    paidAt: row.paid_at,
    patient: getPatient(row.patients)?.full_name ?? "Paciente",
    patientId: row.patient_id,
    paymentMethod,
    paymentMethodLabel: paymentMethod ? paymentMethodLabels[paymentMethod] : "Sin medio",
    paymentNotes: row.payment_notes ?? "",
    paymentStatus,
    paymentStatusLabel: paymentStatusLabels[paymentStatus],
    scheduledAt: row.scheduled_at,
    status: appointmentStatusLabels[row.status],
    time: date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    }),
  };
}

function mapPatient(row: DashboardPatientRow): DashboardPatient {
  return {
    clinicId: row.clinic_id,
    condition: row.initial_condition,
    id: row.id,
    name: row.full_name,
    status: row.status === "active" ? "Activo" : "Inactivo",
  };
}

function sumAmounts(rows: AmountRow[] | null) {
  return (rows ?? []).reduce(
    (total, row) => total + Number(row.session_amount ?? 0),
    0,
  );
}

export function useDashboardSummary() {
  const { activeWorkspace, error: workspaceError, loaded: workspaceLoaded } =
    useActiveWorkspace();
  const { user } = useRequireAuth();
  const [summary, setSummary] = useState<DashboardSummary>(emptySummary);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    if (!workspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");
    const endTimer = startDevTimer("kineflow:dashboard-data-load");
    let queryCount = 0;

    debugDashboard("[DASHBOARD LOAD]", "start");

    try {
      if (workspaceError) {
        setError(workspaceError);
        setSummary(emptySummary);
        return;
      }

      if (!activeWorkspace?.id || !user?.id) {
        setError("No encontramos un espacio de trabajo activo.");
        setSummary(emptySummary);
        return;
      }

      const supabase = getSupabaseClient();
      const userId = user.id;
      const now = new Date();
      const todayStart = startOfDay(now);
      const tomorrowStart = addDays(todayStart, 1);
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const workspaceId = activeWorkspace.id;

      let canViewPatients = true;

      if (activeWorkspace.type === "CLINICA" && activeWorkspace.role === "KINESIOLOGO") {
        if (!activeWorkspace.sourceClinicId) {
          canViewPatients = false;
        } else {
          queryCount += 1;
          const { data, error: accessError } = await supabase
            .from("clinic_professionals")
            .select("can_view_assigned_patients")
            .eq("clinic_id", activeWorkspace.sourceClinicId)
            .eq("professional_id", userId)
            .eq("status", "active")
            .maybeSingle();

          if (accessError) {
            throw new Error(mapSupabaseError(accessError));
          }

          canViewPatients = Boolean(
            (data as ClinicProfessionalAccessRow | null)
              ?.can_view_assigned_patients,
          );
        }
      }

      function applyPatientScope<T>(query: T): T {
        let scopedQuery = query as ScopedQuery;

        scopedQuery = scopedQuery.eq("workspace_id", workspaceId);

        if (activeWorkspace.type === "PERSONAL") {
          scopedQuery = scopedQuery.eq("owner_id", userId).is("clinic_id", null);
        } else if (activeWorkspace.role === "ADMIN") {
          scopedQuery = scopedQuery.eq(
            "clinic_id",
            activeWorkspace.sourceClinicId ?? "",
          );
        } else {
          scopedQuery = scopedQuery
            .eq("clinic_id", activeWorkspace.sourceClinicId ?? "")
            .eq("assigned_professional_id", userId);
        }

        return scopedQuery as T;
      }

      function applyAppointmentScope<T>(query: T): T {
        let scopedQuery = query as ScopedQuery;

        scopedQuery = scopedQuery.eq("workspace_id", workspaceId);

        if (
          activeWorkspace.type === "PERSONAL" ||
          activeWorkspace.role === "KINESIOLOGO"
        ) {
          scopedQuery = scopedQuery.eq("owner_id", userId);
        }

        return scopedQuery as T;
      }

      const activePatientCountQuery = canViewPatients
        ? applyPatientScope(
            supabase
              .from("patients")
              .select("id", { count: "exact", head: true })
              .eq("status", "active"),
          )
        : null;
      const recentPatientsQuery = canViewPatients
        ? applyPatientScope(
            supabase
              .from("patients")
              .select("id, clinic_id, full_name, initial_condition, status")
              .order("created_at", { ascending: false })
              .limit(6),
          )
        : null;

      const appointmentsTodayQuery = applyAppointmentScope(
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("scheduled_at", todayStart.toISOString())
          .lt("scheduled_at", tomorrowStart.toISOString()),
      );
      const upcomingAppointmentsQuery = applyAppointmentScope(
        supabase
          .from("appointments")
          .select(
            "id, patient_id, scheduled_at, duration_minutes, modality, status, session_amount, payment_status, payment_method, paid_at, payment_notes, patients(full_name)",
          )
          .in("status", ["pending", "confirmed", "rescheduled"])
          .gte("scheduled_at", now.toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(6),
      );
      const actionRequiredQuery = applyAppointmentScope(
        supabase
          .from("appointments")
          .select(
            "id, patient_id, scheduled_at, duration_minutes, modality, status, session_amount, payment_status, payment_method, paid_at, payment_notes, patients(full_name)",
          )
          .eq("status", "pending")
          .lt("scheduled_at", now.toISOString())
          .order("scheduled_at", { ascending: false })
          .limit(8),
      );
      const paymentActionRequiredQuery = applyAppointmentScope(
        supabase
          .from("appointments")
          .select(
            "id, patient_id, scheduled_at, duration_minutes, modality, status, session_amount, payment_status, payment_method, paid_at, payment_notes, patients(full_name)",
          )
          .in("status", ["attended", "completed"])
          .eq("payment_status", "pending")
          .gt("session_amount", 0)
          .order("scheduled_at", { ascending: false })
          .limit(8),
      );
      const pendingPaymentAmountQuery = applyAppointmentScope(
        supabase
          .from("appointments")
          .select("session_amount")
          .eq("payment_status", "pending")
          .gt("session_amount", 0),
      );
      const monthIncomeQuery = applyAppointmentScope(
        supabase
          .from("appointments")
          .select("session_amount")
          .eq("payment_status", "paid")
          .or(
            `and(paid_at.gte.${toDateValue(monthStart)},paid_at.lt.${toDateValue(monthEnd)}),and(paid_at.is.null,scheduled_at.gte.${monthStart.toISOString()},scheduled_at.lt.${monthEnd.toISOString()})`,
          ),
      );

      queryCount += canViewPatients ? 8 : 6;
      const [
        activePatientCountResult,
        recentPatientsResult,
        appointmentsTodayResult,
        upcomingAppointmentsResult,
        actionRequiredResult,
        paymentActionRequiredResult,
        pendingPaymentAmountResult,
        monthIncomeResult,
      ] = await Promise.all([
        activePatientCountQuery,
        recentPatientsQuery,
        appointmentsTodayQuery,
        upcomingAppointmentsQuery,
        actionRequiredQuery,
        paymentActionRequiredQuery,
        pendingPaymentAmountQuery,
        monthIncomeQuery,
      ]);

      const possibleErrors = [
        activePatientCountResult?.error,
        recentPatientsResult?.error,
        appointmentsTodayResult.error,
        upcomingAppointmentsResult.error,
        actionRequiredResult.error,
        paymentActionRequiredResult.error,
        pendingPaymentAmountResult.error,
        monthIncomeResult.error,
      ].filter(Boolean);

      if (possibleErrors[0]) {
        throw new Error(mapSupabaseError(possibleErrors[0]));
      }

      const paymentActionRequired = (
        (paymentActionRequiredResult.data ?? []) as unknown as DashboardAppointmentRow[]
      ).map(mapAppointment);

      setSummary({
        actionRequired: (
          (actionRequiredResult.data ?? []) as unknown as DashboardAppointmentRow[]
        ).map(mapAppointment),
        activePatientCount: activePatientCountResult?.count ?? 0,
        appointmentsTodayCount: appointmentsTodayResult.count ?? 0,
        monthIncome: sumAmounts((monthIncomeResult.data ?? []) as AmountRow[]),
        paymentActionRequired,
        pendingPaymentAmount: sumAmounts(
          (pendingPaymentAmountResult.data ?? []) as AmountRow[],
        ),
        pendingPaymentCount: paymentActionRequired.length,
        recentPatients: (
          (recentPatientsResult?.data ?? []) as DashboardPatientRow[]
        ).map(mapPatient),
        upcomingAppointments: (
          (upcomingAppointmentsResult.data ?? []) as unknown as DashboardAppointmentRow[]
        ).map(mapAppointment),
      });

      if (process.env.NODE_ENV === "development") {
        console.info("[kineflow] dashboard queries", queryCount);
      }
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar el dashboard."),
      );
      setSummary(emptySummary);
    } finally {
      endTimer();
      setLoaded(true);
    }
  }, [
    activeWorkspace?.id,
    activeWorkspace?.role,
    activeWorkspace?.sourceClinicId,
    activeWorkspace?.type,
    user?.id,
    workspaceError,
    workspaceLoaded,
  ]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  return {
    error,
    loaded,
    refreshDashboardSummary: loadSummary,
    summary,
  };
}
