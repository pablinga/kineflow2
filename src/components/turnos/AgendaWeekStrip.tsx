import { ChevronLeft, ChevronRight } from "lucide-react";

type AgendaWeekStripProps = {
  /** Días visibles (los 7 de la semana). */
  days: Date[];
  /** `toDateString()` de los días que tienen turnos (muestran un punto). */
  daysWithAppointments: Set<string>;
  onNextWeek: () => void;
  onPreviousWeek: () => void;
  onSelectDay: (day: Date) => void;
  selectedDate: Date;
};

const iconButtonClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors duration-150 ease-out active:bg-ocean-100";

function sameDay(left: Date, right: Date) {
  return left.toDateString() === right.toDateString();
}

/** Tira de días de la semana de la vista Día (celular), con flechas de semana. */
export function AgendaWeekStrip({
  days,
  daysWithAppointments,
  onNextWeek,
  onPreviousWeek,
  onSelectDay,
  selectedDate,
}: AgendaWeekStripProps) {
  const today = new Date();

  return (
    <div className="mt-3 flex items-center gap-0.5">
      <button
        aria-label="Semana anterior"
        className={iconButtonClass}
        onClick={onPreviousWeek}
        type="button"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="grid flex-1 grid-cols-7 gap-0.5">
        {days.map((day) => {
          const selected = sameDay(day, selectedDate);
          const isToday = sameDay(day, today);
          const hasAppointments = daysWithAppointments.has(day.toDateString());

          return (
            <button
              aria-current={isToday ? "date" : undefined}
              aria-label={day.toLocaleDateString("es-AR", {
                day: "numeric",
                month: "long",
                weekday: "long",
              })}
              aria-pressed={selected}
              className={`flex flex-col items-center gap-0.5 rounded-2xl py-1.5 transition-colors duration-150 ease-out ${
                selected ? "bg-ocean-600 text-white" : "text-slate-500 active:bg-ocean-50"
              }`}
              key={day.toDateString()}
              onClick={() => onSelectDay(day)}
              type="button"
            >
              <span className="text-[0.7rem] font-semibold uppercase">
                {day.toLocaleDateString("es-AR", { weekday: "narrow" })}
              </span>
              <span
                className={`text-base font-bold ${
                  selected ? "text-white" : isToday ? "text-ocean-700" : "text-ink"
                }`}
              >
                {day.getDate()}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  hasAppointments ? (selected ? "bg-white" : "bg-ocean-300") : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>
      <button
        aria-label="Semana siguiente"
        className={iconButtonClass}
        onClick={onNextWeek}
        type="button"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
