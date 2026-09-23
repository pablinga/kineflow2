"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";
import { TreatmentDocumentation } from "@/components/treatments/TreatmentDocumentation";
import type { Appointment } from "@/hooks/useAppointments";
import type { Treatment, TreatmentStatus } from "@/hooks/useTreatments";
import { getAppointmentDisplayStatus } from "@/lib/appointment-ui";
import { formatCurrency } from "@/lib/payment-ui";

const treatmentStatusStyles: Record<TreatmentStatus, string> = {
  ABANDONADO: "bg-slate-100 text-slate-700",
  EN_CURSO: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  FINALIZADO: "bg-sky-50 text-sky-700",
  PAUSADO: "bg-amber-50 text-amber-700",
};

const treatmentStatusLabels: Record<TreatmentStatus, string> = {
  ABANDONADO: "Abandonado",
  EN_CURSO: "En curso",
  FINALIZADO: "Finalizado",
  PAUSADO: "Pausado",
};

const statusActions: Array<{
  className: string;
  label: string;
  status: TreatmentStatus;
}> = [
  { className: "border-emerald-200 text-emerald-700 hover:bg-emerald-50", label: "Reanudar", status: "EN_CURSO" },
  { className: "border-amber-200 text-amber-700 hover:bg-amber-50", label: "Pausar", status: "PAUSADO" },
  { className: "border-sky-200 text-sky-700 hover:bg-sky-50", label: "Finalizar", status: "FINALIZADO" },
  { className: "border-slate-200 text-slate-700 hover:bg-slate-50", label: "Marcar como abandonado", status: "ABANDONADO" },
];

type TreatmentListProps = {
  appointments: Appointment[];
  /** Fecha de la evolución asociada a cada turno (por id de turno). */
  evolutionDateByAppointment: Map<string, string>;
  isReadOnly: boolean;
  onStatusChange: (id: string, status: TreatmentStatus) => Promise<void>;
  patientId: string;
  readOnlyMessage: string;
  treatments: Treatment[];
};

function getPending(treatment: Treatment) {
  return Math.max(treatment.totalSessions - treatment.usedSessions, 0);
}

function getProgress(treatment: Treatment) {
  return treatment.totalSessions > 0
    ? Math.min(100, (treatment.usedSessions / treatment.totalSessions) * 100)
    : 0;
}

export function TreatmentList({
  appointments,
  evolutionDateByAppointment,
  isReadOnly,
  onStatusChange,
  patientId,
  readOnlyMessage,
  treatments,
}: TreatmentListProps) {
  const [detailId, setDetailId] = useState("");
  const [updating, setUpdating] = useState(false);
  // Los tratamientos en curso primero; después, el resto en el orden original.
  const sortedTreatments = [
    ...treatments.filter((item) => item.status === "EN_CURSO"),
    ...treatments.filter((item) => item.status !== "EN_CURSO"),
  ];
  const detail = treatments.find((item) => item.id === detailId) ?? null;
  const detailAppointments = detail
    ? appointments.filter((appointment) => appointment.treatmentId === detail.id)
    : [];

  async function changeStatus(status: TreatmentStatus) {
    if (!detail) {
      return;
    }

    setUpdating(true);

    try {
      await onStatusChange(detail.id, status);
    } finally {
      setUpdating(false);
    }
  }

  if (treatments.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-6 text-center">
        <p className="font-semibold text-ink">
          Este paciente todavía no tiene tratamientos.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-4 divide-y divide-ocean-100 rounded-lg border border-ocean-100">
        {sortedTreatments.map((treatment) => (
          <li key={treatment.id}>
            <button
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-ocean-50"
              onClick={() => setDetailId(treatment.id)}
              type="button"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink">
                  {treatment.diagnosis}
                </span>
                <span className="block truncate text-xs font-medium text-slate-500">
                  {treatment.bodyRegion || "Sin región"} · {treatment.usedSessions}/
                  {treatment.totalSessions} sesiones
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${treatmentStatusStyles[treatment.status]}`}
              >
                {treatmentStatusLabels[treatment.status]}
              </span>
              <span
                aria-label={`Ver detalle de ${treatment.diagnosis}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ocean-700"
                title="Ver detalle"
              >
                <FileText className="h-4 w-4" />
              </span>
            </button>
          </li>
        ))}
      </ul>

      {detail ? (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/60 px-3 pb-3 sm:items-center sm:justify-center sm:px-4 sm:py-6">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-ocean-100 bg-white p-4 shadow-soft sm:rounded-lg sm:p-5">
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-slate-200 sm:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-ink">{detail.diagnosis}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.bodyRegion || "Sin región"} · Inicio {detail.startedAt}
                  {detail.endedAt ? ` · Fin ${detail.endedAt}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${treatmentStatusStyles[detail.status]}`}
                >
                  {treatmentStatusLabels[detail.status]}
                </span>
                <button
                  aria-label="Cerrar"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50"
                  onClick={() => setDetailId("")}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Realizadas", value: detail.usedSessions },
                { label: "Pendientes", value: getPending(detail) },
                { label: "Totales", value: detail.totalSessions },
              ].map((item) => (
                <div className="rounded-lg bg-ocean-50 p-2" key={item.label}>
                  <p className="text-lg font-bold text-ink">{item.value}</p>
                  <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-ocean-50">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${getProgress(detail)}%` }}
              />
            </div>

            {detail.notes ? (
              <p className="mt-4 whitespace-pre-line text-sm text-slate-600">
                {detail.notes}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {statusActions
                .filter((action) => action.status !== detail.status)
                .map((action) => (
                  <button
                    className={`inline-flex min-h-9 items-center rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${action.className}`}
                    disabled={updating || isReadOnly}
                    key={action.status}
                    onClick={() => changeStatus(action.status)}
                    title={isReadOnly ? readOnlyMessage : undefined}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
            </div>

            <h3 className="mt-5 font-bold text-ink">Sesiones</h3>
            {detailAppointments.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-ocean-100 p-3 text-sm text-slate-500">
                Sin sesiones asociadas.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-ocean-100 rounded-lg border border-ocean-100">
                {detailAppointments.map((appointment) => {
                  const evolutionDate = evolutionDateByAppointment.get(appointment.id);

                  return (
                    <li
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
                      key={appointment.id}
                    >
                      <span className="font-bold text-ocean-800">
                        #{appointment.sessionNumber ?? "-"}
                      </span>
                      <span className="text-ink">
                        {appointment.date} · {appointment.time}
                      </span>
                      <span className="text-slate-500">
                        {getAppointmentDisplayStatus(appointment)} ·{" "}
                        {appointment.paymentStatusLabel} ·{" "}
                        {formatCurrency(appointment.amount)}
                      </span>
                      <span className="text-ocean-700">
                        {evolutionDate ? `Evolución ${evolutionDate}` : "Sin evolución"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <TreatmentDocumentation patientId={patientId} treatmentId={detail.id} />
          </div>
        </div>
      ) : null}
    </>
  );
}
