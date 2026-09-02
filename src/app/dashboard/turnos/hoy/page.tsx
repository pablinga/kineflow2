"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardSignature, Clock3, XCircle } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useAppointments } from "@/hooks/useAppointments";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage } from "@/lib/error-messages";

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export default function ListadoDelDiaPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const {
    appointments,
    error: appointmentsError,
    loaded: appointmentsLoaded,
    updateAppointmentStatus,
  } = useAppointments();
  const { providers } = useInsuranceProviders();
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState("");

  const insuranceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providers) map.set(provider.id, provider.name);
    return map;
  }, [providers]);

  const todaysAppointments = useMemo(() => {
    const today = new Date();
    return [...appointments]
      .filter((appointment) => sameDay(new Date(appointment.scheduledAt), today))
      .filter((appointment) => appointment.status !== "Cancelado")
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
  }, [appointments]);

  const showProfessionalColumn = activeWorkspace?.type === "CLINICA";

  async function handleStatusChange(id: string, status: "attended" | "no_show") {
    setActionError("");
    setUpdatingId(id);

    try {
      await updateAppointmentStatus(id, status);
    } catch (error) {
      setActionError(
        getFriendlyErrorMessage(error, "No pudimos actualizar el turno."),
      );
    } finally {
      setUpdatingId("");
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

  if (loading || !workspaceLoaded || !appointmentsLoaded) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">
            Listado del día
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {new Date().toLocaleDateString("es-AR", {
              day: "2-digit",
              month: "long",
              weekday: "long",
              year: "numeric",
            })}
          </p>

          {appointmentsError ? (
            <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {appointmentsError}
            </p>
          ) : null}

          {actionError ? (
            <p className="mt-4 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError}
            </p>
          ) : null}

          {todaysAppointments.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-white p-8 text-center">
              <p className="font-semibold text-ink">No hay turnos para hoy.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {todaysAppointments.map((appointment) => {
                const isUpdating = updatingId === appointment.id;

                return (
                  <article
                    className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card"
                    key={appointment.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-ocean-800">
                          <Clock3 className="h-4 w-4" />
                          {appointment.time}
                        </span>
                        <div>
                          <p className="font-semibold text-ink">
                            {appointment.patient}
                          </p>
                          {showProfessionalColumn ? (
                            <p className="text-xs text-slate-500">
                              {appointment.professionalName ?? "Sin asignar"}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-semibold text-ocean-800 ring-1 ring-ocean-100">
                        {appointment.insuranceProviderId
                          ? insuranceNameById.get(appointment.insuranceProviderId) ??
                            "Obra social"
                          : "Particular"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ocean-50 pt-3">
                      <span className="text-sm font-semibold text-slate-600">
                        Estado: {appointment.status}
                      </span>

                      <div className="flex flex-wrap gap-2">
                        <button
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(appointment.id, "attended")}
                          type="button"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Asistió
                        </button>
                        <button
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={isUpdating}
                          onClick={() => handleStatusChange(appointment.id, "no_show")}
                          type="button"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          No asistió
                        </button>
                        {/* Firma del paciente: se suma en un paso siguiente. */}
                        <button
                          className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-400"
                          disabled
                          title="Próximamente"
                          type="button"
                        >
                          <ClipboardSignature className="h-3.5 w-3.5" />
                          Firmar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
