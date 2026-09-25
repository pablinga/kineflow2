"use client";

import { type FormEvent, useState } from "react";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { FieldLabel } from "@/components/ui/FieldLabel";
import type { Appointment } from "@/hooks/useAppointments";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

type ClinicEvolutionModalProps = {
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
 * Evolución de un turno de clínica registrada por el kinesiólogo desde su
 * espacio particular. Se guarda en el workspace de la clínica (el del turno),
 * no en el espacio activo; la RLS exige que la clínica lo haya habilitado.
 */
export function ClinicEvolutionModal({
  appointment,
  onClose,
  onSaved,
}: ClinicEvolutionModalProps) {
  const [sessionDate, setSessionDate] = useState(() =>
    toDateInputValue(appointment.scheduledAt),
  );
  const [painLevel, setPainLevel] = useState(0);
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [nextGoals, setNextGoals] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clinicalNotes.trim()) {
      setError("Completá el tratamiento realizado en la sesión.");
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
        next_goals: nextGoals.trim() || null,
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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-ocean-100 bg-white p-5 shadow-soft"
        onSubmit={handleSubmit}
      >
        <h2 className="text-lg font-bold text-ink">Registrar evolución</h2>
        <p className="mt-1 text-sm text-slate-500">
          {appointment.patient} · {appointment.date} · {appointment.time} ·{" "}
          {appointment.clinicName ?? "Clínica"}
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

        {[
          { label: "Nivel de dolor", onChange: (value: string) => setPainLevel(Number(value)), value: String(painLevel) },
        ].map((field) => (
          <label className="mt-4 block" key={field.label}>
            <span className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-700">
              {field.label}
              <span className="rounded-full bg-ocean-50 px-3 py-1 text-ocean-800">
                {field.value}/10
              </span>
            </span>
            <input
              className="mt-3 w-full accent-ocean-600"
              max={10}
              min={0}
              onChange={(event) => field.onChange(event.target.value)}
              step={1}
              type="range"
              value={field.value}
            />
          </label>
        ))}

        <label className="mt-4 block">
          <FieldLabel required>Tratamiento</FieldLabel>
          <textarea
            className="mt-2 min-h-20 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
            onChange={(event) => setClinicalNotes(event.target.value)}
            required
            value={clinicalNotes}
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-slate-700">
            Próximos objetivos
          </span>
          <textarea
            className="mt-2 min-h-16 w-full rounded-lg border border-ocean-100 px-4 py-3 text-sm outline-none focus:border-ocean-400"
            onChange={(event) => setNextGoals(event.target.value)}
            value={nextGoals}
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
