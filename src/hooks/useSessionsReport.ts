"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { type PaymentType } from "@/hooks/useAppointments";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { formatDate } from "@/lib/format";
import {
  appointmentStatusLabels,
  type AppointmentStatusCode,
} from "@/lib/appointment-ui";
import { getSupabaseClient } from "@/lib/supabase";

export type ReportRow = {
  date: string;
  time: string;
  patient: string;
  professional: string;
  paymentType: string;
  provider: string;
  memberNumber: string;
  amount: number;
  status: string;
};

export type UseSessionsReportOptions = {
  month: string;
  paymentType: "all" | PaymentType;
  providerId: string;
};

type SessionAppointmentRow = {
  id: string;
  scheduled_at: string;
  status: AppointmentStatusCode;
  session_amount: number | null;
  payment_type: PaymentType;
  insurance_provider_id: string | null;
  art_provider_id: string | null;
  insurance_member_number: string | null;
  patients: { full_name: string } | Array<{ full_name: string }> | null;
  clinic_professionals:
    | {
        profiles: { full_name: string } | Array<{ full_name: string }> | null;
      }
    | Array<{
        profiles: { full_name: string } | Array<{ full_name: string }> | null;
      }>
    | null;
};

type ProviderRow = {
  id: string;
  name: string;
};

const paymentTypeLabels: Record<PaymentType, string> = {
  PARTICULAR: "Particular",
  OBRA_SOCIAL: "Obra social",
  ART: "ART",
};

function getPatient(
  patient: { full_name: string } | Array<{ full_name: string }> | null,
) {
  return Array.isArray(patient) ? patient[0] : patient;
}

function getClinicProfessional(
  clinicProfessional: SessionAppointmentRow["clinic_professionals"],
) {
  return Array.isArray(clinicProfessional)
    ? clinicProfessional[0]
    : clinicProfessional;
}

function getProfile(
  profile: { full_name: string } | Array<{ full_name: string }> | null,
) {
  return Array.isArray(profile) ? profile[0] : profile;
}

function toMonthStartIso(month: string) {
  return new Date(`${month}-01T00:00:00-03:00`).toISOString();
}

function toMonthEndIso(month: string) {
  const monthStart = new Date(`${month}-01T00:00:00-03:00`);
  monthStart.setUTCMonth(monthStart.getUTCMonth() + 1);
  return monthStart.toISOString();
}

function mapReportRow(
  row: SessionAppointmentRow,
  providerNamesByType: {
    art: Map<string, string>;
    insurance: Map<string, string>;
  },
): ReportRow {
  const clinicProfessional = getClinicProfessional(row.clinic_professionals);
  const professionalProfile = clinicProfessional
    ? getProfile(clinicProfessional.profiles)
    : null;
  const provider =
    row.payment_type === "OBRA_SOCIAL" && row.insurance_provider_id
      ? providerNamesByType.insurance.get(row.insurance_provider_id) ?? ""
      : row.payment_type === "ART" && row.art_provider_id
        ? providerNamesByType.art.get(row.art_provider_id) ?? ""
        : "";

  return {
    amount: Number(row.session_amount ?? 0),
    date: formatDate(new Date(row.scheduled_at)),
    // Mismo formato que la agenda (useAppointments).
    time: new Date(row.scheduled_at).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
    }),
    memberNumber: row.insurance_member_number ?? "",
    patient: getPatient(row.patients)?.full_name ?? "Paciente",
    paymentType: paymentTypeLabels[row.payment_type],
    professional: professionalProfile?.full_name ?? "",
    provider,
    status: appointmentStatusLabels[row.status],
  };
}

export function useSessionsReport(options: UseSessionsReportOptions) {
  const { activeWorkspace, error: workspaceError, loaded: workspaceLoaded } =
    useActiveWorkspace();
  const { user } = useRequireAuth();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadReport = useCallback(
    async (signal?: AbortSignal) => {
      if (!workspaceLoaded) {
        return;
      }

      setLoaded(false);
      setError("");

      try {
        if (workspaceError) {
          setError(workspaceError);
          setRows([]);
          return;
        }

        if (!activeWorkspace?.id || !user?.id) {
          setError("No encontramos un espacio de trabajo activo.");
          setRows([]);
          return;
        }

        const supabase = getSupabaseClient();
        let appointmentsQuery = supabase
          .from("appointments")
          .select(
            "id, scheduled_at, status, session_amount, payment_type, insurance_provider_id, art_provider_id, insurance_member_number, patients(full_name), clinic_professionals(profiles(full_name))",
          )
          .eq("workspace_id", activeWorkspace.id)
          .gte("scheduled_at", toMonthStartIso(options.month))
          .lt("scheduled_at", toMonthEndIso(options.month))
          .order("scheduled_at", { ascending: true });

        if (activeWorkspace.type === "PERSONAL") {
          appointmentsQuery = appointmentsQuery.eq("owner_id", user.id);
        }

        if (options.paymentType !== "all") {
          appointmentsQuery = appointmentsQuery.eq(
            "payment_type",
            options.paymentType,
          );
        }

        if (options.providerId && options.paymentType === "OBRA_SOCIAL") {
          appointmentsQuery = appointmentsQuery.eq(
            "insurance_provider_id",
            options.providerId,
          );
        }

        if (options.providerId && options.paymentType === "ART") {
          appointmentsQuery = appointmentsQuery.eq(
            "art_provider_id",
            options.providerId,
          );
        }

        let insuranceProvidersQuery = supabase
          .from("insurance_providers")
          .select("id, name")
          .eq("workspace_id", activeWorkspace.id);
        let artProvidersQuery = supabase
          .from("art_providers")
          .select("id, name")
          .eq("workspace_id", activeWorkspace.id);

        if (signal) {
          appointmentsQuery = appointmentsQuery.abortSignal(signal);
          insuranceProvidersQuery = insuranceProvidersQuery.abortSignal(signal);
          artProvidersQuery = artProvidersQuery.abortSignal(signal);
        }

        const [appointmentsResult, insuranceProvidersResult, artProvidersResult] =
          await Promise.all([
            appointmentsQuery,
            insuranceProvidersQuery,
            artProvidersQuery,
          ]);

        if (signal?.aborted) {
          return;
        }

        if (
          appointmentsResult.error ||
          insuranceProvidersResult.error ||
          artProvidersResult.error
        ) {
          throw new Error(
            mapSupabaseError(
              appointmentsResult.error ??
                insuranceProvidersResult.error ??
                artProvidersResult.error,
            ),
          );
        }

        const insuranceNamesById = new Map(
          ((insuranceProvidersResult.data ?? []) as ProviderRow[]).map(
            (provider) => [provider.id, provider.name] as const,
          ),
        );
        const artNamesById = new Map(
          ((artProvidersResult.data ?? []) as ProviderRow[]).map(
            (provider) => [provider.id, provider.name] as const,
          ),
        );

        setRows(
          ((appointmentsResult.data ?? []) as unknown as SessionAppointmentRow[]).map(
            (row) =>
              mapReportRow(row, {
                art: artNamesById,
                insurance: insuranceNamesById,
              }),
          ),
        );
      } catch (loadError) {
        if (signal?.aborted) {
          return;
        }

        setError(
          getFriendlyErrorMessage(loadError, "No pudimos cargar el reporte."),
        );
        setRows([]);
      } finally {
        if (!signal?.aborted) {
          setLoaded(true);
        }
      }
    },
    [
      activeWorkspace?.id,
      activeWorkspace?.type,
      options.month,
      options.paymentType,
      options.providerId,
      user?.id,
      workspaceError,
      workspaceLoaded,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadReport(controller.signal);

    return () => {
      controller.abort();
    };
  }, [loadReport]);

  return {
    error,
    loaded,
    refreshReport: loadReport,
    rows,
  };
}
