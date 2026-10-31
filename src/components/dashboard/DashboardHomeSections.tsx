"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  estimateHoursSaved,
  formatCompactCurrency,
  formatHours,
  formatShortDay,
  getAttendanceSummary,
  getOccupancyPercent,
  getWeekDelta,
  MINUTES_SAVED_PER_ONLINE_BOOKING,
  MINUTES_SAVED_PER_REMINDER,
  type DashboardHomeStats,
  type ResolveRow,
} from "@/lib/dashboard-home";
import { formatCurrency } from "@/lib/format";

const cardClass =
  "rounded-2xl border border-ocean-100 bg-white p-4 shadow-card sm:p-5";

// Colores pedidos para asistencia: azul primario, naranja y gris oscuro (sin
// rojo/verde). Se acompañan con leyenda y cantidades: nunca solo color.
const ATTENDANCE_COLORS = {
  attended: "#1565FF",
  cancelled: "#E8833A",
  noShow: "#3B4C61",
};
const INCOME_CURRENT = "#0F55DC";
const INCOME_PAST = "#B8CFFF";
const INCOME_EMPTY = "#DCE8FF";

// Gráficos dibujados a mano (SVG/CSS): son una dona y 8 barras, y así el
// Inicio no carga una librería de gráficos entera.
const DONUT_GAP = 1.2;

type DonutSlice = { color: string; label: string; value: number };

function AttendanceDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const visible = slices.filter((slice) => slice.value > 0);
  const gap = visible.length > 1 ? DONUT_GAP : 0;
  let offset = 0;

  return (
    <svg aria-hidden className="h-full w-full -rotate-90" viewBox="0 0 36 36">
      {visible.map((slice) => {
        const length = (slice.value / total) * 100;
        const dash = Math.max(length - gap, 0.1);
        const circle = (
          <circle
            cx="18"
            cy="18"
            fill="none"
            key={slice.label}
            pathLength={100}
            r="15.5"
            stroke={slice.color}
            strokeDasharray={`${dash} ${100 - dash}`}
            strokeDashoffset={-offset}
            strokeWidth="5"
          >
            <title>{`${slice.label}: ${slice.value}`}</title>
          </circle>
        );

        offset += length;
        return circle;
      })}
    </svg>
  );
}

function KpiTile({
  children,
  label,
  value,
}: {
  children?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className={cardClass}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-1 whitespace-nowrap text-[1.65rem] font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">
        {value}
      </p>
      {children ? <div className="mt-2">{children}</div> : null}
    </article>
  );
}

export function HomeKpiGrid({
  canSeeIncome,
  stats,
}: {
  canSeeIncome: boolean;
  stats: DashboardHomeStats;
}) {
  const delta = getWeekDelta(
    stats.weekAppointments,
    stats.previousWeekAppointments,
  );
  const occupancy = getOccupancyPercent(
    stats.weekBookedMinutes,
    stats.weekAvailableMinutes,
  );

  return (
    <section
      aria-label="Indicadores"
      className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4 xl:order-3 xl:col-span-3"
    >
      <KpiTile label="Turnos esta semana" value={String(stats.weekAppointments)}>
        <p
          className={`text-sm font-semibold ${
            delta.positive ? "text-emerald-700" : "text-slate-600"
          }`}
        >
          {delta.label}
        </p>
      </KpiTile>

      {occupancy !== null ? (
        <KpiTile label="Ocupación de agenda" value={`${occupancy}%`}>
          <div
            aria-hidden
            className="h-2 overflow-hidden rounded-full bg-ocean-100"
          >
            <div
              className="h-full rounded-full bg-ocean-600"
              style={{ width: `${Math.min(occupancy, 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs font-medium text-slate-600">
            Sobre tus horarios de esta semana
          </p>
        </KpiTile>
      ) : null}

      {canSeeIncome ? (
        <KpiTile label="Cobrado este mes" value={formatCurrency(stats.monthCollected)}>
          {stats.pendingPaymentAmount > 0 ? (
            <p className="text-sm font-semibold text-orange-700">
              {formatCurrency(stats.pendingPaymentAmount)} pendiente
            </p>
          ) : (
            <p className="text-sm font-medium text-slate-600">Todo al día</p>
          )}
        </KpiTile>
      ) : null}

      <KpiTile label="Pacientes activos" value={String(stats.activePatients)}>
        <p className="text-sm font-medium text-slate-600">
          Con turnos en ±30 días
        </p>
      </KpiTile>
    </section>
  );
}

export function AttendanceCard({ stats }: { stats: DashboardHomeStats }) {
  const summary = getAttendanceSummary({
    attended: stats.monthAttended,
    cancelled: stats.monthCancelled,
    noShow: stats.monthNoShow,
  });

  // Sin turnos en el mes no hay nada que graficar: la sección no se muestra.
  if (summary.total === 0 || summary.attendedPercent === null) {
    return null;
  }

  const slices = [
    { color: ATTENDANCE_COLORS.attended, label: "Asistió", value: stats.monthAttended },
    { color: ATTENDANCE_COLORS.cancelled, label: "Canceló", value: stats.monthCancelled },
    { color: ATTENDANCE_COLORS.noShow, label: "Ausente", value: stats.monthNoShow },
  ];

  return (
    <section aria-labelledby="attendance-title" className={`${cardClass} xl:order-4`}>
      <h2 className="text-lg font-bold text-ink" id="attendance-title">
        Asistencia del mes
      </h2>
      <div className="mt-3 flex items-center gap-5">
        <div className="relative h-36 w-36 shrink-0">
          <AttendanceDonut slices={slices} total={summary.total} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-ink">
              {summary.attendedPercent}%
            </span>
            <span className="text-xs font-medium text-slate-600">asistencia</span>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          {slices.map((slice) => (
            <li className="flex items-center gap-2" key={slice.label}>
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-slate-700">{slice.label}</span>
              <span className="font-bold text-ink">{slice.value}</span>
            </li>
          ))}
        </ul>
      </div>
      {stats.monthNoShow > 0 ? (
        <p className="mt-3 rounded-xl bg-ocean-50 px-3 py-2 text-sm font-medium text-slate-700">
          {stats.monthNoShow} {stats.monthNoShow === 1 ? "ausencia" : "ausencias"}
          {stats.monthNoShowAmount !== null
            ? ` ≈ ${formatCurrency(stats.monthNoShowAmount)} sin cobrar este mes`
            : " este mes"}
        </p>
      ) : null}
    </section>
  );
}

export function WeeklyIncomeCard({ stats }: { stats: DashboardHomeStats }) {
  const weeks = stats.weeklyIncome.map((week, index, all) => ({
    ...week,
    amount: Number(week.amount),
    current: index === all.length - 1,
  }));

  // Sin ningún cobro en 8 semanas no se grafica.
  if (weeks.length === 0 || weeks.every((week) => week.amount === 0)) {
    return null;
  }

  const firstLabel = formatShortDay(weeks[0].weekStart);
  const maxAmount = Math.max(...weeks.map((week) => week.amount));

  return (
    <section aria-labelledby="weekly-income-title" className={`${cardClass} xl:order-5`}>
      <h2 className="text-lg font-bold text-ink" id="weekly-income-title">
        Ingresos por semana
      </h2>
      {/* Las semanas en $0 se ven como una rayita para que se lean las 8; la
          actual lleva su monto encima. */}
      <ul className="mt-3 flex h-[8.5rem] items-end gap-0.5 pt-6">
        {weeks.map((week) => {
          const label = `Semana del ${formatShortDay(week.weekStart)}: ${formatCurrency(week.amount)}`;

          return (
            <li
              aria-label={label}
              className="relative flex h-full flex-1 items-end"
              key={week.weekStart}
              title={label}
            >
              <span
                className="relative block w-full rounded-t"
                style={{
                  backgroundColor: week.current
                    ? INCOME_CURRENT
                    : week.amount > 0
                      ? INCOME_PAST
                      : INCOME_EMPTY,
                  height:
                    week.amount > 0
                      ? `max(3px, ${(week.amount / maxAmount) * 100}%)`
                      : "3px",
                }}
              >
                {week.current && week.amount > 0 ? (
                  <span className="absolute -top-5 right-0 whitespace-nowrap text-xs font-bold text-ink">
                    {formatCompactCurrency(week.amount)}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 flex justify-between text-xs text-slate-600">
        <span>{firstLabel}</span>
        <span>esta semana</span>
      </div>
    </section>
  );
}

export function ResolveCard({ rows }: { rows: ResolveRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="resolve-title" className={`${cardClass} xl:order-2`}>
      <h2 className="text-lg font-bold text-ink" id="resolve-title">
        Para resolver
      </h2>
      <ul className="mt-3 divide-y divide-ocean-100">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              className="flex min-h-12 items-center gap-3 py-2 text-sm font-semibold text-slate-800 transition hover:text-ocean-700"
              href={row.href}
              prefetch={false}
            >
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-orange-50 px-2 text-sm font-extrabold text-orange-800 ring-1 ring-orange-200">
                {row.count}
              </span>
              <span className="flex-1">{row.label}</span>
              <ChevronRight aria-hidden className="h-4 w-4 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function KineflowMonthCard({
  onlineBookings,
  remindersSent,
}: {
  onlineBookings: number;
  remindersSent: number | null;
}) {
  const hasReminders = remindersSent !== null && remindersSent > 0;

  if (!hasReminders && onlineBookings === 0) {
    return null;
  }

  const hours = estimateHoursSaved(remindersSent, onlineBookings);

  return (
    <section
      aria-labelledby="kineflow-month-title"
      className="rounded-2xl bg-ink p-5 text-white shadow-soft xl:order-6"
    >
      <h2 className="text-lg font-extrabold" id="kineflow-month-title">
        Tu mes con KineFlow
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-4">
        {hasReminders ? (
          <div>
            <dt className="text-sm text-slate-300">Recordatorios enviados</dt>
            <dd className="text-3xl font-extrabold">{remindersSent}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-slate-300">Reservas online</dt>
          <dd className="text-3xl font-extrabold">{onlineBookings}</dd>
        </div>
      </dl>
      {hours > 0 ? (
        <p
          className="mt-4 text-base font-bold"
          title={`Estimado: ${MINUTES_SAVED_PER_REMINDER} min por recordatorio y ${MINUTES_SAVED_PER_ONLINE_BOOKING} min por reserva online.`}
        >
          ≈ {formatHours(hours)} h ahorradas{" "}
          <span className="text-sm font-medium text-slate-300">(valor estimado)</span>
        </p>
      ) : null}
      <p className="mt-4 text-xs font-bold tracking-[0.2em] text-slate-300">
        − GESTIÓN + TIEMPO
      </p>
    </section>
  );
}
