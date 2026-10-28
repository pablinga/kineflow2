"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarClock, MessageCircle, Search, UserPlus, X } from "lucide-react";
import {
  RepeatSeriesSection,
  type RepeatSeriesState,
} from "@/components/turnos/RepeatSeriesSection";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type {
  Appointment,
  NewClinicAppointmentInput,
  PaymentType,
} from "@/hooks/useAppointments";
import type { AttentionType } from "@/hooks/useAttentionTypes";
import type { InsuranceProvider } from "@/hooks/useInsuranceProviders";
import type { NewPatientInput, Patient } from "@/hooks/usePatients";
import { getPrefilledSessionAmount } from "@/lib/attention-pricing";
import { type AgendaSlot, searchPatients } from "@/lib/clinic-agenda";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { formatCurrency } from "@/lib/payment-ui";

type ClinicBookingPanelProps = {
  addClinicAppointment: (input: NewClinicAppointmentInput) => Promise<unknown>;
  addPatient: (input: NewPatientInput) => Promise<string>;
  allowsSimultaneous: boolean;
  appointments: Appointment[];
  attentionType: AttentionType | null;
  canSeeAmounts: boolean;
  clinicId: string;
  defaultSessionPrice: number;
  durationMinutes: number;
  insuranceProviders: InsuranceProvider[];
  onClose: () => void;
  onSaved: (message: string) => void;
  patients: Patient[];
  slot: AgendaSlot;
  workspaceId: string;
  /** Mensaje si no puede dar turnos (plan, solo lectura), o null. */
  writeBlockMessage: string | null;
};

const inputClassName =
  "mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400";

function formatSlotDay(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatUpcoming(appointment: Appointment) {
  const date = new Date(appointment.scheduledAt);

  return `${date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    weekday: "short",
  })} · ${appointment.time}`;
}

/**
 * Panel para dar un turno en un horario libre de la agenda de la clínica:
 * buscar al paciente (o darlo de alta con lo mínimo), elegir el profesional
 * entre los libres y guardar. Mismo guardado que Nuevo turno
 * (addClinicAppointment, que también manda la confirmación por WhatsApp).
 */
export function ClinicBookingPanel({
  addClinicAppointment,
  addPatient,
  allowsSimultaneous,
  appointments,
  attentionType,
  canSeeAmounts,
  clinicId,
  defaultSessionPrice,
  durationMinutes,
  insuranceProviders,
  onClose,
  onSaved,
  patients,
  slot,
  workspaceId,
  writeBlockMessage,
}: ClinicBookingPanelProps) {
  const [query, setQuery] = useState("");
  const [patientId, setPatientId] = useState("");
  const [professionalId, setProfessionalId] = useState(
    slot.professionals[0]?.clinicProfessionalId ?? "",
  );
  const [professionalTouched, setProfessionalTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [newPatient, setNewPatient] = useState({ document: "", name: "", phone: "" });
  const [savingPatient, setSavingPatient] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [amountOverride, setAmountOverride] = useState<number | null>(null);
  const [repeatState, setRepeatState] = useState<RepeatSeriesState>("off");

  // Escape cierra el panel (salvo mientras guarda).
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const patient = patients.find((item) => item.id === patientId) ?? null;
  const results = useMemo(
    () => (patient ? [] : searchPatients(patients, query)),
    [patient, patients, query],
  );

  // Con el paciente elegido, se propone su profesional asignado si está libre.
  useEffect(() => {
    if (!patient || professionalTouched) {
      return;
    }

    const assigned = slot.professionals.find(
      (professional) => professional.professionalId === patient.assignedProfessionalId,
    );

    if (assigned) {
      setProfessionalId(assigned.clinicProfessionalId);
    }
  }, [patient, professionalTouched, slot.professionals]);

  const professional =
    slot.professionals.find((item) => item.clinicProfessionalId === professionalId) ?? null;
  const upcoming = useMemo(() => {
    if (!patientId) {
      return [];
    }

    const now = Date.now();

    return appointments
      .filter(
        (appointment) =>
          appointment.patientId === patientId &&
          appointment.rawStatus !== "cancelled" &&
          new Date(appointment.scheduledAt).getTime() >= now,
      )
      .slice(0, 3);
  }, [appointments, patientId]);

  // Cobertura de la ficha: obra social activa → se registra como obra social.
  const provider = patient
    ? insuranceProviders.find(
        (item) => item.active && item.id === patient.insuranceProviderId,
      ) ?? null
    : null;
  const paymentType: PaymentType = provider ? "OBRA_SOCIAL" : "PARTICULAR";
  const prefilledAmount =
    getPrefilledSessionAmount({
      attentionTypePrice: attentionType?.price,
      particularDefaultPrice: defaultSessionPrice,
      paymentType,
      providerPrice: provider?.sessionPrice,
    }) ?? defaultSessionPrice;
  const sessionAmount = amountOverride ?? prefilledAmount;

  async function handleCreatePatient() {
    setError("");

    if (!newPatient.name.trim()) {
      setError("Ingresá el nombre del paciente.");
      return;
    }

    setSavingPatient(true);

    try {
      const id = await addPatient({
        assignedProfessionalId: professional?.professionalId,
        condition: "",
        document: newPatient.document,
        email: "",
        name: newPatient.name.trim(),
        phone: newPatient.phone,
      });
      setPatientId(id);
      setCreatingPatient(false);
      setNewPatient({ document: "", name: "", phone: "" });
    } catch (createError) {
      setError(getFriendlyErrorMessage(createError, "No pudimos crear el paciente."));
    } finally {
      setSavingPatient(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (writeBlockMessage) {
      setError(writeBlockMessage);
      return;
    }

    if (!patient) {
      setError("Elegí un paciente.");
      return;
    }

    if (!professional) {
      setError("Elegí un profesional.");
      return;
    }

    if (repeatState === "pending") {
      setError("Esperá a que termine de revisar la serie de turnos, o desactivá \"Repetir este turno\".");
      return;
    }

    const repeatDates = Array.isArray(repeatState) ? repeatState : [];

    setSaving(true);

    try {
      await addClinicAppointment({
        allowsSimultaneous,
        artProviderId: null,
        attentionTypeId: attentionType?.id ?? null,
        attentionTypeName: attentionType?.name ?? null,
        clinicId,
        clinicProfessionalId: professional.clinicProfessionalId,
        date: slot.date,
        durationMinutes,
        insuranceMemberNumber: provider ? patient.insuranceMemberNumber || null : null,
        insuranceProviderId: provider?.id ?? null,
        modality: "presencial",
        notes: notes.trim(),
        patientId: patient.id,
        paymentType,
        professionalId: professional.professionalId,
        reason: attentionType?.name ?? "",
        repeatDates,
        sessionAmount,
        sessionNumber: null,
        time: slot.startTime,
        treatmentId: "",
      });
      onSaved(
        repeatDates.length > 0
          ? `${repeatDates.length + 1} turnos dados: ${patient.name}, desde el ${formatSlotDay(slot.date)} ${slot.startTime}`
          : `Turno dado: ${patient.name}, ${formatSlotDay(slot.date)} ${slot.startTime}`,
      );
    } catch (saveError) {
      setError(getFriendlyErrorMessage(saveError, "No pudimos guardar el turno."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink/40 xl:static xl:z-auto xl:block xl:bg-transparent"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <form
        aria-label="Dar turno"
        className="flex h-full w-full flex-col overflow-y-auto bg-white shadow-soft sm:max-w-md xl:sticky xl:top-4 xl:h-auto xl:max-h-[calc(100vh-2rem)] xl:max-w-none xl:rounded-lg xl:border xl:border-ocean-100 xl:shadow-card"
        onSubmit={handleSubmit}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ocean-100 p-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Dar turno</h2>
            <p className="mt-0.5 text-sm font-semibold text-ocean-800">
              {capitalizeFirst(formatSlotDay(slot.date))} · {slot.startTime} a {slot.endTime}
            </p>
            {attentionType ? (
              <p className="text-sm text-slate-600">
                {attentionType.name} · {durationMinutes} min
              </p>
            ) : null}
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-ocean-50"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 p-4">
          {slot.professionals.length > 1 ? (
            <label className="block">
              <FieldLabel required>Profesional</FieldLabel>
              <select
                className={inputClassName}
                onChange={(event) => {
                  setProfessionalTouched(true);
                  setProfessionalId(event.target.value);
                }}
                value={professionalId}
              >
                {slot.professionals.map((item) => (
                  <option key={item.clinicProfessionalId} value={item.clinicProfessionalId}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-ink">Profesional:</span>{" "}
              {professional?.name ?? "Sin profesional"}
            </p>
          )}

          {patient ? (
            <div className="rounded-lg border border-ocean-200 bg-ocean-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    className="block truncate font-semibold text-ink underline-offset-4 hover:underline"
                    href={`/dashboard/pacientes/${patient.id}`}
                    prefetch={false}
                  >
                    {patient.name}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {[patient.document && `DNI ${patient.document}`, patient.phone]
                      .filter(Boolean)
                      .join(" · ") || "Sin datos de contacto"}
                  </p>
                  <p className="text-sm text-slate-600">
                    {provider ? `Obra social: ${provider.name}` : "Particular"}
                  </p>
                </div>
                <button
                  className="shrink-0 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
                  onClick={() => {
                    setPatientId("");
                    setQuery("");
                    setAmountOverride(null);
                    setProfessionalTouched(false);
                  }}
                  type="button"
                >
                  Cambiar
                </button>
              </div>
            </div>
          ) : creatingPatient ? (
            <div className="rounded-lg border border-ocean-100 p-3">
              <p className="font-semibold text-ink">Paciente nuevo</p>
              <label className="mt-2 block">
                <FieldLabel required>Nombre y apellido</FieldLabel>
                <input
                  autoFocus
                  className={inputClassName}
                  onChange={(event) =>
                    setNewPatient((current) => ({ ...current, name: event.target.value }))
                  }
                  value={newPatient.name}
                />
              </label>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel required>DNI</FieldLabel>
                  <input
                    className={inputClassName}
                    inputMode="numeric"
                    onChange={(event) =>
                      setNewPatient((current) => ({ ...current, document: event.target.value }))
                    }
                    value={newPatient.document}
                  />
                </label>
                <label className="block">
                  <FieldLabel required>Teléfono</FieldLabel>
                  <input
                    className={inputClassName}
                    inputMode="tel"
                    onChange={(event) =>
                      setNewPatient((current) => ({ ...current, phone: event.target.value }))
                    }
                    value={newPatient.phone}
                  />
                </label>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                El resto de los datos se completan después en la ficha.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                  disabled={savingPatient}
                  onClick={() => void handleCreatePatient()}
                  type="button"
                >
                  {savingPatient ? "Creando..." : "Crear paciente"}
                </button>
                <button
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-ocean-200 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                  onClick={() => setCreatingPatient(false)}
                  type="button"
                >
                  Volver
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block">
                <FieldLabel required>Paciente</FieldLabel>
                <span className="relative mt-2 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    className="min-h-11 w-full rounded-lg border border-ocean-100 bg-white pl-9 pr-3 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Nombre, DNI o teléfono"
                    type="search"
                    value={query}
                  />
                </span>
              </label>
              {query.trim() ? (
                <ul className="mt-2 divide-y divide-ocean-100 rounded-lg border border-ocean-100">
                  {results.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-slate-600">
                      No encontramos pacientes con &quot;{query.trim()}&quot;.
                    </li>
                  ) : null}
                  {results.map((item) => (
                    <li key={item.id}>
                      <button
                        className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left transition hover:bg-ocean-50"
                        onClick={() => setPatientId(item.id)}
                        type="button"
                      >
                        <span className="text-sm font-semibold text-ink">{item.name}</span>
                        <span className="text-xs text-slate-600">
                          {[item.document && `DNI ${item.document}`, item.phone]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <button
                className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-ocean-700 hover:text-ocean-900"
                onClick={() => {
                  setCreatingPatient(true);
                  // Si escribió un nombre, se precarga; si escribió números, el DNI.
                  const typed = query.trim();
                  setNewPatient(
                    /^\d[\d.\s-]*$/.test(typed)
                      ? { document: typed, name: "", phone: "" }
                      : { document: "", name: typed, phone: "" },
                  );
                }}
                type="button"
              >
                <UserPlus className="h-4 w-4" />
                Paciente nuevo
              </button>
            </div>
          )}

          {patient && upcoming.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-center gap-2 font-semibold">
                <CalendarClock className="h-4 w-4" />
                Próximos turnos de {patient.name.split(" ")[0]}
              </p>
              <ul className="mt-1 space-y-0.5">
                {upcoming.map((appointment) => (
                  <li key={appointment.id}>
                    {capitalizeFirst(formatUpcoming(appointment))}
                    {appointment.professionalName ? ` · ${appointment.professionalName}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {patient && canSeeAmounts ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Valor de la sesión</span>
              <input
                className={inputClassName}
                min={0}
                onChange={(event) => setAmountOverride(Number(event.target.value))}
                step="0.01"
                type="number"
                value={sessionAmount}
              />
              {amountOverride === null ? (
                <span className="mt-1 block text-xs text-slate-500">
                  {formatCurrency(prefilledAmount)} según{" "}
                  {provider ? "la obra social" : attentionType ? "el tipo de atención" : "el valor por defecto"}.
                </span>
              ) : null}
            </label>
          ) : null}

          {patient && professional ? (
            <RepeatSeriesSection
              allowsSimultaneous={allowsSimultaneous}
              clinicProfessionalId={professional.clinicProfessionalId}
              durationMinutes={durationMinutes}
              // La disponibilidad del profesional ya descuenta los turnos cargados.
              isLocallyBusy={() => false}
              onChange={setRepeatState}
              slotProfessional={professional.clinicProfessionalId}
              startDate={slot.date}
              time={slot.startTime}
              workspaceId={workspaceId}
            />
          ) : null}

          {patient ? (
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Nota (opcional)</span>
              <textarea
                className="mt-2 min-h-20 w-full rounded-lg border border-ocean-100 px-3 py-2 text-sm outline-none focus:border-ocean-400"
                onChange={(event) => setNotes(event.target.value)}
                value={notes}
              />
            </label>
          ) : null}

          {error || writeBlockMessage ? (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
              {error || writeBlockMessage}
            </p>
          ) : null}
        </div>

        <div className="sticky bottom-0 border-t border-ocean-100 bg-white p-4">
          <button
            className="inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-ocean-600 px-5 text-base font-semibold text-white shadow-soft transition hover:bg-ocean-700 disabled:opacity-60"
            disabled={saving || !patient || !professional || Boolean(writeBlockMessage)}
            type="submit"
          >
            {saving ? "Guardando..." : "Guardar turno"}
          </button>
          {patient?.whatsappRemindersActive ? (
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-600">
              <MessageCircle className="h-3.5 w-3.5" />
              Con WhatsApp activado en la clínica, le llega la confirmación.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
