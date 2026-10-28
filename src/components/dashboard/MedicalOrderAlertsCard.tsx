"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useWorkspaceMedicalOrders } from "@/hooks/useMedicalOrders";
import { formatDate } from "@/lib/format";
import { type MedicalOrderAlert } from "@/lib/medical-orders";
import { getSupabaseClient } from "@/lib/supabase";

function describeAlert(alert: MedicalOrderAlert, providerName: string) {
  if (alert.kind === "no_order") {
    const time = new Date(alert.scheduledAt).toLocaleTimeString("es-AR", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: "America/Argentina/Buenos_Aires",
    });
    return `Turno ${formatDate(alert.date)} ${time} sin orden vigente`;
  }

  const sessions = alert.remaining === 1 ? "queda 1 sesión" : `quedan ${alert.remaining} sesiones`;
  const extra =
    alert.uncoveredScheduled > 0
      ? ` y ${alert.uncoveredScheduled === 1 ? "1 turno dado" : `${alert.uncoveredScheduled} turnos dados`} sin orden`
      : "";
  const prefix = providerName ? `${providerName} · ` : "";

  if (alert.state === "expiring" && alert.expiresOn) {
    return `${prefix}la orden vence el ${formatDate(alert.expiresOn)} (${sessions})${extra}`;
  }

  return `${prefix}${sessions}${extra}`;
}

/** "Órdenes para renovar" en el Inicio. No se muestra si no hay avisos. */
export function MedicalOrderAlertsCard() {
  const { alerts, ordersById } = useWorkspaceMedicalOrders();
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const patientIds = useMemo(
    () => Array.from(new Set(alerts.map((alert) => alert.patientId))).sort(),
    [alerts],
  );
  const patientKey = patientIds.join(",");

  useEffect(() => {
    if (!patientKey) {
      return;
    }

    let cancelled = false;

    void getSupabaseClient()
      .from("patients")
      .select("id, full_name")
      .in("id", patientKey.split(","))
      .then(({ data }) => {
        if (!cancelled && data) {
          setNames(new Map(data.map((row) => [row.id as string, row.full_name as string])));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [patientKey]);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="orders-title"
      className="rounded-2xl border border-ocean-100 bg-white p-4 shadow-card sm:p-5 xl:order-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink" id="orders-title">
          Órdenes para renovar
        </h2>
        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-50 px-2 text-sm font-extrabold text-orange-800 ring-1 ring-orange-200">
          {alerts.length}
        </span>
      </div>
      <ul className="mt-3 divide-y divide-ocean-100">
        {alerts.slice(0, 8).map((alert) => {
          const order = alert.kind === "renew" ? ordersById.get(alert.orderId) : undefined;

          return (
            <li key={alert.kind === "renew" ? alert.orderId : alert.appointmentId}>
              <Link
                className="flex min-h-12 items-center gap-3 py-2 text-sm transition hover:text-ocean-700"
                href={`/dashboard/pacientes/${alert.patientId}`}
                prefetch={false}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-800">
                    {names.get(alert.patientId) ?? "Paciente"}
                  </span>
                  <span className="block text-slate-500">
                    {describeAlert(alert, order?.providerName ?? "")}
                  </span>
                </span>
                <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
              </Link>
            </li>
          );
        })}
      </ul>
      {alerts.length > 8 ? (
        <p className="mt-2 text-xs text-slate-500">Y {alerts.length - 8} más.</p>
      ) : null}
    </section>
  );
}
