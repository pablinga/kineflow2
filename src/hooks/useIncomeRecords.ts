"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  paymentMethodLabels,
  paymentStatusLabels,
  type PaymentMethod,
  type PaymentStatus,
} from "@/hooks/useAppointments";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase";

export type IncomeRecord = {
  amount: number;
  date: string;
  id: string;
  modality: string;
  paidAt: string | null;
  patient: string;
  patientId: string;
  paymentMethod: PaymentMethod | "";
  paymentMethodLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  scheduledAt: string;
  status: string;
  time: string;
};

export type IncomeSummary = {
  averageAmount: number;
  paidAmount: number;
  paidCount: number;
  pendingAmount: number;
  pendingCount: number;
};

export type UseIncomeRecordsOptions = {
  fromDate: string;
  page: number;
  pageSize: number;
  patientSearch: string;
  paymentMethod: PaymentMethod | "all";
  paymentStatus: PaymentStatus | "all";
  toDate: string;
};

type IncomeAppointmentRow = {
  id: string;
  patient_id: string;
  scheduled_at: string;
  modality: "presencial" | "domicilio" | "virtual";
  status:
    | "pending"
    | "attended"
    | "cancelled"
    | "no_show"
    | "rescheduled"
    | "confirmed"
    | "completed";
  session_amount: number | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  paid_at: string | null;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
};

type AmountRow = {
  payment_status: PaymentStatus | null;
  session_amount: number | null;
};

type FilterableIncomeQuery = {
  eq: (column: string, value: unknown) => FilterableIncomeQuery;
  gte: (column: string, value: string) => FilterableIncomeQuery;
  ilike: (column: string, value: string) => FilterableIncomeQuery;
  lt: (column: string, value: string) => FilterableIncomeQuery;
};

const emptySummary: IncomeSummary = {
  averageAmount: 0,
  paidAmount: 0,
  paidCount: 0,
  pendingAmount: 0,
  pendingCount: 0,
};

const statusLabels: Record<IncomeAppointmentRow["status"], string> = {
  attended: "AsistiÃ³",
  cancelled: "Cancelado",
  completed: "AsistiÃ³",
  confirmed: "Pendiente",
  no_show: "No asistiÃ³",
  pending: "Pendiente",
  rescheduled: "Reprogramado",
};

const modalityLabels: Record<IncomeAppointmentRow["modality"], string> = {
  domicilio: "Domicilio",
  presencial: "Presencial",
  virtual: "Virtual",
};

function getPatient(
  patient: { full_name: string } | Array<{ full_name: string }> | null,
) {
  return Array.isArray(patient) ? patient[0] : patient;
}

function mapIncomeRecord(row: IncomeAppointmentRow): IncomeRecord {
  const date = new Date(row.scheduled_at);
  const paymentStatus = row.payment_status ?? "pending";
  const paymentMethod = row.payment_method ?? "";

  return {
    amount: Number(row.session_amount ?? 0),
    date: formatDate(date),
    id: row.id,
    modality: modalityLabels[row.modality],
    paidAt: row.paid_at,
    patient: getPatient(row.patients)?.full_name ?? "Paciente",
    patientId: row.patient_id,
    paymentMethod,
    paymentMethodLabel: paymentMethod ? paymentMethodLabels[paymentMethod] : "Sin medio",
    paymentStatus,
    paymentStatusLabel: paymentStatusLabels[paymentStatus],
    scheduledAt: row.scheduled_at,
    status: statusLabels[row.status],
    time: date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    }),
  };
}

function toStartOfDayIso(dateValue: string) {
  return new Date(`${dateValue}T00:00:00-03:00`).toISOString();
}

function toExclusiveEndOfDayIso(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function applyFilters<T>(
  query: T,
  params: {
    fromDate: string;
    patientSearch: string;
    paymentMethod: PaymentMethod | "all";
    paymentStatus: PaymentStatus | "all";
    toDate: string;
    userId: string;
    workspaceId: string;
    workspaceType: string;
  },
) {
  let scopedQuery = query as FilterableIncomeQuery;

  scopedQuery = scopedQuery.eq("workspace_id", params.workspaceId);

  if (params.workspaceType === "PERSONAL") {
    scopedQuery = scopedQuery.eq("owner_id", params.userId);
  }

  if (params.fromDate) {
    scopedQuery = scopedQuery.gte("scheduled_at", toStartOfDayIso(params.fromDate));
  }

  if (params.toDate) {
    scopedQuery = scopedQuery.lt("scheduled_at", toExclusiveEndOfDayIso(params.toDate));
  }

  if (params.paymentStatus !== "all") {
    scopedQuery = scopedQuery.eq("payment_status", params.paymentStatus);
  }

  if (params.paymentMethod !== "all") {
    scopedQuery = scopedQuery.eq("payment_method", params.paymentMethod);
  }

  const normalizedPatientSearch = params.patientSearch
    .trim()
    .replace(/[,%]/g, " ");

  if (normalizedPatientSearch) {
    scopedQuery = scopedQuery.ilike(
      "patients.full_name",
      `%${normalizedPatientSearch}%`,
    );
  }

  return scopedQuery as T;
}

function getSummary(rows: AmountRow[]): IncomeSummary {
  const paidRows = rows.filter((row) => row.payment_status === "paid");
  const pendingRows = rows.filter(
    (row) => row.payment_status === "pending" && Number(row.session_amount ?? 0) > 0,
  );
  const paidAmount = paidRows.reduce(
    (total, row) => total + Number(row.session_amount ?? 0),
    0,
  );
  const pendingAmount = pendingRows.reduce(
    (total, row) => total + Number(row.session_amount ?? 0),
    0,
  );

  return {
    averageAmount: paidRows.length > 0 ? paidAmount / paidRows.length : 0,
    paidAmount,
    paidCount: paidRows.length,
    pendingAmount,
    pendingCount: pendingRows.length,
  };
}

export function useIncomeRecords(options: UseIncomeRecordsOptions) {
  const { activeWorkspace, error: workspaceError, loaded: workspaceLoaded } =
    useActiveWorkspace();
  const { user } = useRequireAuth();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [summary, setSummary] = useState<IncomeSummary>(emptySummary);
  const [totalCount, setTotalCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadIncome = useCallback(
    async (signal?: AbortSignal) => {
      if (!workspaceLoaded) {
        return;
      }

      setLoaded(false);
      setError("");

      try {
        if (workspaceError) {
          setError(workspaceError);
          setRecords([]);
          setSummary(emptySummary);
          setTotalCount(0);
          return;
        }

        if (!activeWorkspace?.id || !user?.id) {
          setError("No encontramos un espacio de trabajo activo.");
          setRecords([]);
          setSummary(emptySummary);
          setTotalCount(0);
          return;
        }

        const supabase = getSupabaseClient();
        const filterParams = {
          fromDate: options.fromDate,
          patientSearch: options.patientSearch,
          paymentMethod: options.paymentMethod,
          paymentStatus: options.paymentStatus,
          toDate: options.toDate,
          userId: user.id,
          workspaceId: activeWorkspace.id,
          workspaceType: activeWorkspace.type,
        };
        const from = (Math.max(options.page, 1) - 1) * options.pageSize;
        const to = from + options.pageSize - 1;
        let recordsQuery = applyFilters(
          supabase
            .from("appointments")
            .select(
              "id, patient_id, scheduled_at, modality, status, session_amount, payment_status, payment_method, paid_at, patients!inner(full_name)",
              { count: "exact" },
            )
            .order("scheduled_at", { ascending: false })
            .range(from, to),
          filterParams,
        );
        let summaryQuery = applyFilters(
          supabase
            .from("appointments")
            .select("session_amount, payment_status"),
          filterParams,
        );

        if (signal) {
          recordsQuery = recordsQuery.abortSignal(signal);
          summaryQuery = summaryQuery.abortSignal(signal);
        }

        const [recordsResult, summaryResult] = await Promise.all([
          recordsQuery,
          summaryQuery,
        ]);

        if (signal?.aborted) {
          return;
        }

        if (recordsResult.error || summaryResult.error) {
          throw new Error(
            mapSupabaseError(recordsResult.error ?? summaryResult.error),
          );
        }

        setRecords(
          ((recordsResult.data ?? []) as unknown as IncomeAppointmentRow[]).map(
            mapIncomeRecord,
          ),
        );
        setSummary(getSummary((summaryResult.data ?? []) as AmountRow[]));
        setTotalCount(recordsResult.count ?? 0);
      } catch (loadError) {
        if (signal?.aborted) {
          return;
        }

        setError(
          getFriendlyErrorMessage(loadError, "No pudimos cargar ingresos."),
        );
        setRecords([]);
        setSummary(emptySummary);
        setTotalCount(0);
      } finally {
        if (!signal?.aborted) {
          setLoaded(true);
        }
      }
    },
    [
      activeWorkspace?.id,
      activeWorkspace?.type,
      options.fromDate,
      options.page,
      options.pageSize,
      options.patientSearch,
      options.paymentMethod,
      options.paymentStatus,
      options.toDate,
      user?.id,
      workspaceError,
      workspaceLoaded,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadIncome(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadIncome]);

  return {
    error,
    loaded,
    records,
    refreshIncome: loadIncome,
    summary,
    totalCount,
  };
}
