"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardSignature,
  Clock3,
  XCircle,
} from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { SignaturePad } from "@/components/turnos/SignaturePad";
import { useAppointments, type Appointment } from "@/hooks/useAppointments";
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
    saveAppointmentSignature,
    updateAppointmentStatus,
  } = useAppointments();
  const { providers } = useInsuranceProviders();
  const [actionError, setActionError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [signingAppointment, setSigningAppointment] =
    useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const insuranceNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providers) map.set(provider.id, provider.name);
    return map;
  }, [providers]);

  const dayAppointments = useMemo(() => {
    return [...appointments]
      .filter((appointment) =>
        sameDay(new Date(appointment.scheduledAt), selectedDate),
      )
      .filter((appointment) => appointment.status !== "Cancelado")
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
  }, [appointments, selectedDate]);

  const showProfessionalColumn = activeWorkspace?.type === "CLINICA";

  function goToPreviousDay() {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() - 1);
      return next;
    });
  }

  function goToNextDay() {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + 1);
      return next;
    });
  }

  function goToToday() {
    setSelectedDate(new Date());
  }

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
            Sesiones diarias
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              aria-label="Día anterior"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ocean-100 text-ocean-700 transition hover:bg-ocean-50"
              onClick={goToPreviousDay}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="min-w-[14rem] text-sm font-semibold text-slate-600">
              {selectedDate.toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "long",
                weekday: "long",
                year: "numeric",
              })}
            </p>
            <button
              aria-label="Día siguiente"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-ocean-100 text-ocean-700 transition hover:bg-ocean-50"
              onClick={goToNextDay}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {!sameDay(selectedDate, new Date()) ? (
              <button
                className="ml-1 text-xs font-semibold text-ocean-700 underline-offset-2 hover:underline"
                onClick={goToToday}
                type="button"
              >
                Volver a hoy
              </button>
            ) : null}
          </div>

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

          {dayAppointments.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-white p-8 text-center">
              <p className="font-semibold text-ink">
                No hay turnos para {sameDay(selectedDate, new Date()) ? "hoy" : "este día"}.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {dayAppointments.map((appointment) => {
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
                        {appointment.signaturePath ? (
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
                            <ClipboardSignature className="h-3.5 w-3.5" />
                            Firmado
                          </span>
                        ) : (
                          <button
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-ocean-200 px-3 text-xs font-semibold text-ocean-700 transition hover:bg-ocean-50"
                            onClick={() => setSigningAppointment(appointment)}
                            type="button"
                          >
                            <ClipboardSignature className="h-3.5 w-3.5" />
                            Firmar
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {signingAppointment ? (
        <SignaturePad
          onCancel={() => setSigningAppointment(null)}
          onSave={async (blob) => {
            await saveAppointmentSignature(signingAppointment, blob);
            setSigningAppointment(null);
          }}
          patientName={signingAppointment.patient}
        />
      ) : null}
    </main>
  );
}
