"use client";

import { useEffect, useState } from "react";
import { Loader2, Repeat } from "lucide-react";
import {
  MAX_SERIES_COUNT,
  MIN_SERIES_COUNT,
  type SeriesDateStatus,
  type SeriesPlan,
  buildSeriesCandidates,
  clampSeriesCount,
  planSeries,
  seriesWeekday,
  splitIntoAvailabilityRanges,
} from "@/lib/appointment-series";

type AvailabilitySlot = {
  date: string;
  professionals: Array<{ clinicProfessionalId: string }>;
  startTime: string;
};

/**
 * Estado de la serie para el formulario: "off" (no se repite), "pending"
 * (revisando o con error: no se puede guardar todavía) o las fechas extra
 * (sin la del primer turno).
 */
export type RepeatSeriesState = "off" | "pending" | string[];

type RepeatSeriesSectionProps = {
  allowsSimultaneous: boolean;
  /** clinic_professional del turno (clínica); null en el espacio particular. */
  clinicProfessionalId: string | null;
  disabled?: boolean;
  durationMinutes: number;
  /** Choque con un turno ya cargado (para la carga manual, sin horarios). */
  isLocallyBusy: (date: string) => boolean;
  onChange: (state: RepeatSeriesState) => void;
  /**
   * Profesional para /api/appointments/availability ("self" en el particular,
   * id de clinic_professional en la clínica). null = carga manual: solo se
   * revisan feriados y choques con turnos cargados.
   */
  slotProfessional: string | null;
  startDate: string;
  time: string;
  workspaceId: string;
};

const WEEKDAYS: Array<[number, string]> = [
  [1, "Lu"],
  [2, "Ma"],
  [3, "Mi"],
  [4, "Ju"],
  [5, "Vi"],
  [6, "Sá"],
  [0, "Do"],
];

/** "jue 12/11". */
function shortDate(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const weekday = date.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "");

  return `${weekday} ${date.getDate()}/${date.getMonth() + 1}`;
}

const statusText: Record<Exclude<SeriesDateStatus, "ok">, string> = {
  busy: "sin lugar",
  holiday: "feriado",
};

/**
 * "Repetir este turno": días de la semana y cantidad. Revisa cada fecha con
 * la misma disponibilidad que la agenda y saltea feriados y horarios sin
 * lugar hasta completar la cantidad.
 */
export function RepeatSeriesSection({
  allowsSimultaneous,
  clinicProfessionalId,
  disabled = false,
  durationMinutes,
  isLocallyBusy,
  onChange,
  slotProfessional,
  startDate,
  time,
  workspaceId,
}: RepeatSeriesSectionProps) {
  const [enabled, setEnabled] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [count, setCount] = useState(10);
  const [plan, setPlan] = useState<SeriesPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ready = Boolean(startDate && time && workspaceId);
  const weekdaysKey = weekdays.slice().sort().join(",");

  // Al cambiar el primer turno, la serie arranca con su día de la semana.
  useEffect(() => {
    if (startDate) {
      setWeekdays([seriesWeekday(startDate)]);
    }
  }, [startDate]);

  useEffect(() => {
    if (!enabled || !ready) {
      setPlan(null);
      onChange("off");
      return;
    }

    if (weekdays.length === 0) {
      setPlan(null);
      onChange("pending");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      onChange("pending");

      try {
        const candidates = buildSeriesCandidates({ startDate, weekdays });
        const holidays = new Set<string>();
        const freeTimes = new Map<string, boolean>();
        let checkedUntil = startDate;
        let nextPlan: SeriesPlan | null = null;
        const target = clampSeriesCount(count);

        if (candidates.length > 0) {
          const { getSupabaseClient } = await import("@/lib/supabase");
          const { data } = await getSupabaseClient().auth.getSession();
          const accessToken = data.session?.access_token;

          if (!accessToken) {
            throw new Error("No pudimos identificar tu sesión.");
          }

          // De a 31 días hasta tener lugar para toda la serie.
          for (const range of splitIntoAvailabilityRanges(candidates[0], candidates[candidates.length - 1])) {
            const query = new URLSearchParams({
              allowsSimultaneous: String(allowsSimultaneous),
              durationMinutes: String(durationMinutes),
              from: range.from,
              professionalId: slotProfessional ?? "any",
              to: range.to,
              workspaceId,
            });
            const response = await fetch(`/api/appointments/availability?${query}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              signal: controller.signal,
            });
            const result = (await response.json().catch(() => ({}))) as {
              error?: string;
              holidays?: string[];
              slots?: AvailabilitySlot[];
            };

            if (!response.ok) {
              throw new Error(result.error ?? "No pudimos revisar los horarios.");
            }

            for (const holiday of result.holidays ?? []) {
              holidays.add(holiday);
            }

            for (const slot of result.slots ?? []) {
              const professionalFree =
                !clinicProfessionalId ||
                slot.professionals.some((item) => item.clinicProfessionalId === clinicProfessionalId);

              if (slot.startTime === time && professionalFree) {
                freeTimes.set(slot.date, true);
              }
            }

            checkedUntil = range.to;
            nextPlan = planSeries({
              candidates: candidates.filter((date) => date <= checkedUntil),
              count: target,
              startDate,
              statusOf: (date) =>
                holidays.has(date)
                  ? "holiday"
                  : isLocallyBusy(date) || (slotProfessional && !freeTimes.has(date))
                    ? "busy"
                    : "ok",
            });

            if (nextPlan.dates.length >= target) {
              break;
            }
          }
        }

        const finalPlan = nextPlan ?? { dates: [startDate], incomplete: true, skipped: [] };
        setPlan(finalPlan);
        onChange(finalPlan.dates.slice(1));
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }

        setPlan(null);
        setError(loadError instanceof Error ? loadError.message : "No pudimos revisar los horarios.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // onChange e isLocallyBusy cambian en cada render del formulario; la serie
    // se recalcula por sus datos, no por esas referencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allowsSimultaneous,
    clinicProfessionalId,
    count,
    durationMinutes,
    enabled,
    ready,
    slotProfessional,
    startDate,
    time,
    weekdaysKey,
    workspaceId,
  ]);

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  return (
    <div className="rounded-lg border border-ocean-100 bg-white p-3">
      <label className="flex min-h-10 items-center gap-3 text-sm font-semibold text-ink">
        <input
          checked={enabled}
          className="h-5 w-5 accent-ocean-600"
          disabled={disabled || !ready}
          onChange={(event) => setEnabled(event.target.checked)}
          type="checkbox"
        />
        <Repeat aria-hidden className="h-4 w-4 text-ocean-600" />
        Repetir este turno
      </label>
      {!ready ? (
        <p className="mt-1 text-xs text-slate-500">Elegí primero el día y el horario.</p>
      ) : null}

      {enabled && ready ? (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-semibold text-slate-600">Días</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {WEEKDAYS.map(([day, label]) => {
                const checked = weekdays.includes(day);

                return (
                  <button
                    aria-pressed={checked}
                    className={`inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-2 text-sm font-semibold transition ${
                      checked
                        ? "border-ocean-600 bg-ocean-600 text-white"
                        : "border-ocean-200 bg-white text-ocean-800 hover:bg-ocean-50"
                    }`}
                    key={day}
                    onClick={() => toggleWeekday(day)}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-slate-600">
              Cantidad de turnos (incluye este)
            </span>
            <input
              className="mt-1.5 min-h-10 w-24 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
              max={MAX_SERIES_COUNT}
              min={MIN_SERIES_COUNT}
              onChange={(event) => setCount(clampSeriesCount(Number(event.target.value)))}
              type="number"
              value={count}
            />
          </label>

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando lugar para la serie...
            </p>
          ) : error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>
          ) : weekdays.length === 0 ? (
            <p className="text-sm text-slate-600">Elegí al menos un día.</p>
          ) : plan ? (
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-ink">
                Se van a dar {plan.dates.length} turnos a las {time}
                {plan.dates.length > 1 ? `, hasta el ${shortDate(plan.dates[plan.dates.length - 1])}` : ""}.
              </p>
              <ul className="flex flex-wrap gap-1.5" data-testid="series-dates">
                {plan.dates.map((date) => (
                  <li
                    className="rounded-full bg-ocean-50 px-2.5 py-1 text-xs font-semibold text-ocean-800"
                    key={date}
                  >
                    {shortDate(date)}
                  </li>
                ))}
              </ul>
              {plan.skipped.length > 0 ? (
                <p className="text-xs text-slate-600">
                  Salteados:{" "}
                  {plan.skipped
                    .map((item) => `${shortDate(item.date)} (${statusText[item.status]})`)
                    .join(", ")}
                </p>
              ) : null}
              {plan.incomplete ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Solo hay lugar para {plan.dates.length} de {clampSeriesCount(count)} turnos en
                  los próximos 6 meses con esos días y horario.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
