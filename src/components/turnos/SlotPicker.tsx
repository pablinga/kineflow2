"use client";

import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from "lucide-react";

export type PickerSlot = {
  date: string;
  end: string;
  endTime: string;
  /** Profesionales libres en ese horario (uno solo si se eligió profesional). */
  professionals: Array<{ clinicProfessionalId: string; name: string; professionalId: string }>;
  start: string;
  startTime: string;
};

type SlotPickerProps = {
  /** Feriados (YYYY-MM-DD) para marcarlos en el día. */
  holidays?: string[];
  loading: boolean;
  onSelect: (slot: PickerSlot) => void;
  onWeekChange: (weekStart: string) => void;
  selected: string | null;
  /** Muestra cuántos profesionales están libres (modo "Sin preferencia"). */
  showProfessionalCount?: boolean;
  slots: PickerSlot[];
  /** Lunes de la semana visible (YYYY-MM-DD). */
  weekStart: string;
};

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function shiftDateValue(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateValue(date);
}

/** Lunes (YYYY-MM-DD) de la semana de la fecha dada. */
export function getMondayOfWeek(dateValue: string) {
  const day = new Date(`${dateValue}T12:00:00`).getDay();
  return shiftDateValue(dateValue, day === 0 ? -6 : 1 - day);
}

function formatSlotDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
  });
}

function formatShortDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Horarios libres por día de una semana (lunes a domingo), con el mismo
 * criterio visual que la reserva online.
 */
export function SlotPicker({
  holidays = [],
  loading,
  onSelect,
  onWeekChange,
  selected,
  showProfessionalCount = false,
  slots,
  weekStart,
}: SlotPickerProps) {
  const weekEnd = shiftDateValue(weekStart, 6);
  const currentWeekStart = getMondayOfWeek(toDateValue(new Date()));
  const canGoBack = weekStart > currentWeekStart;
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const groupedSlots = useMemo(
    () =>
      slots.reduce<Record<string, PickerSlot[]>>((groups, slot) => {
        groups[slot.date] = [...(groups[slot.date] ?? []), slot];
        return groups;
      }, {}),
    [slots],
  );

  return (
    <div className="rounded-lg border border-ocean-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-ink">
            <CalendarDays className="h-4 w-4 text-ocean-600" />
            Horarios disponibles
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Mostramos únicamente franjas libres.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <p className="text-sm font-bold text-ink">
            {formatShortDate(weekStart)} al {formatShortDate(weekEnd)}
          </p>
          <div className="flex gap-2">
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-100 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canGoBack}
              onClick={() => onWeekChange(shiftDateValue(weekStart, -7))}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-100 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
              onClick={() => onWeekChange(shiftDateValue(weekStart, 7))}
              type="button"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-lg bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
          Buscando horarios...
        </div>
      ) : slots.length === 0 ? (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-5 text-sm font-semibold text-ocean-800 sm:flex-row sm:items-center sm:justify-between">
          <span>No hay horarios disponibles esta semana.</span>
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-white px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
            onClick={() => onWeekChange(shiftDateValue(weekStart, 7))}
            type="button"
          >
            Ver semana siguiente
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {Object.entries(groupedSlots).map(([date, daySlots]) => (
            <div className="rounded-lg border border-ocean-100 p-4" key={date}>
              <p className="text-sm font-bold capitalize text-ink">
                {formatSlotDate(date)}
                {holidaySet.has(date) ? (
                  <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold normal-case text-amber-800 ring-1 ring-amber-100">
                    Feriado
                  </span>
                ) : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {daySlots.map((slot) => {
                  const isSelected = selected === slot.start;
                  const freeCount = slot.professionals.length;

                  return (
                    <button
                      className={
                        isSelected
                          ? "inline-flex min-h-10 items-center gap-2 rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                          : "inline-flex min-h-10 items-center gap-2 rounded-lg border border-ocean-100 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                      }
                      key={slot.start}
                      onClick={() => onSelect(slot)}
                      title={slot.professionals.map((professional) => professional.name).join(", ")}
                      type="button"
                    >
                      <Clock className="h-4 w-4" />
                      {slot.startTime}
                      {showProfessionalCount ? (
                        <span
                          className={`text-xs font-semibold ${isSelected ? "text-ocean-100" : "text-slate-500"}`}
                        >
                          · {freeCount} {freeCount === 1 ? "libre" : "libres"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
