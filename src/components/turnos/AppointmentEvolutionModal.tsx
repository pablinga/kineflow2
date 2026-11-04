"use client";

import { type FormEvent, useState } from "react";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { OptionalPainSelect } from "@/components/evolutions/OptionalPainSelect";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type { Appointment } from "@/hooks/useAppointments";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type AppointmentEvolutionModalProps = {
  appointment: Appointment;
  onClose: () => void;
  onSaved: (appointmentId: string) => void;
};

function toDateInputValue(scheduledAt: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(scheduledAt));
}

/**
 * Evolución de un turno asistido, registrada desde la agenda (mismo guardado
 * que la ficha del paciente). Se guarda en el workspace del turno, no en el
 * espacio activo: en un turno de clínica visto por el kinesiólogo, la RLS
 * exige que la clínica lo haya habilitado.
 */
export function AppointmentEvolutionModal({
  appointment,
  onClose,
  onSaved,
}: AppointmentEvolutionModalProps) {
  const [sessionDate, setSessionDate] = useState(() =>
    toDateInputValue(appointment.scheduledAt),
  );
  const [painLevel, setPainLevel] = useState<number | null>(null);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clinicalNotes.trim()) {
      setError("Completá qué se hizo en la sesión.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;

      if (!userId || !appointment.workspaceId) {
        throw new Error("No pudimos identificar el turno o tu sesión.");
      }

      const { error: insertError } = await supabase.from("evolutions").insert({
        appointment_id: appointment.id,
        clinical_notes: clinicalNotes.trim(),
        owner_id: userId,
        pain_level: painLevel,
        patient_id: appointment.patientId,
        session_date: sessionDate,
        treatment_id: appointment.treatmentId || null,
        workspace_id: appointment.workspaceId,
      });

      if (insertError) {
        throw new Error(mapSupabaseError(insertError));
      }

      onSaved(appointment.id);
    } catch (saveError) {
      setError(
        getFriendlyErrorMessage(saveError, "No pudimos guardar la evolución."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4 py-6">
      <form
        className="max-h-[90vh] supports-[height:100dvh]:max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-bold text-ink">Registrar evolución</h2>
        <p className="mt-1 text-sm text-slate-500">
          {[
            appointment.patient,
            appointment.date,
            appointment.time,
            appointment.origin === "clinic" ? appointment.clinicName ?? "Clínica" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <label className="mt-5 block">
          <FieldLabel required>Fecha</FieldLabel>
          <input
            className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
            onChange={(event) => setSessionDate(event.target.value)}
            required
            type="date"
            value={sessionDate}
          />
        </label>

        <div className="mt-4">
          <OptionalPainSelect onChange={setPainLevel} value={painLevel} />
        </div>

        <label className="mt-4 block">
          <FieldLabel required>¿Qué se hizo en la sesión?</FieldLabel>
          <textarea
            className="mt-2 min-h-20 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
            onChange={(event) => setClinicalNotes(event.target.value)}
            required
            value={clinicalNotes}
          />
        </label>

        {error ? (
          <Alert className="mt-4" tone="error">
            {error}
          </Alert>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-ocean-200 px-5 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
            disabled={saving}
            type="submit"
          >
            <Save className="h-4 w-4" />
            {saving ? "Guardando..." : "Guardar evolución"}
          </button>
        </div>
      </form>
    </div>
  );
}
