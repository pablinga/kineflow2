"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
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

// Recharts hace foco en el SVG al tocarlo y el navegador le dibuja un
// recuadro negro: se saca (la información está también en texto).
const chartFocusReset =
  "[&_.recharts-wrapper]:outline-none [&_svg]:outline-none [&_*:focus]:outline-none";

type ChartTooltipProps = {
  active?: boolean;
  label?: unknown;
  payload?: Array<{
    name?: unknown;
    payload?: { weekStart?: string; amount?: number; label?: string; value?: number };
    value?: unknown;
  }>;
};

/** Tooltip con el estilo de las tarjetas (sirve para barras y anillo). */
function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const item = payload?.[0];

  if (!active || !item?.payload) {
    return null;
  }

  const data = item.payload;
  const title = data.weekStart
    ? `Semana del ${formatShortDay(data.weekStart)}`
    : String(data.label ?? item.name ?? "");
  const value = data.weekStart
    ? formatCurrency(Number(data.amount ?? 0))
    : String(data.value ?? item.value ?? "");

  return (
    <div className="rounded-xl border border-ocean-100 bg-white px-3 py-2 text-sm shadow-card">
      <p className="font-medium text-slate-600">{title}</p>
      <p className="font-extrabold text-ink">{value}</p>
    </div>
  );
}

type IncomeBarProps = {
  height: number;
  payload: { amount: number; current: boolean };
  width: number;
  x: number;
  y: number;
};

function IncomeBar({ height, payload, width, x, y }: IncomeBarProps) {
  const radius = Math.min(4, width / 2, height);
  const fill = payload.current
    ? INCOME_CURRENT
    : payload.amount > 0
      ? INCOME_PAST
      : INCOME_EMPTY;
  // Rectángulo con las esquinas de arriba redondeadas, apoyado en la base.
  const path = `M${x},${y + height} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + width - radius},${y} Q${x + width},${y} ${x + width},${y + radius} L${x + width},${y + height} Z`;

  return (
    <g>
      <path d={path} fill={fill} />
      {payload.current && payload.amount > 0 ? (
        <text
          fill="#0D1B2A"
          fontSize={12}
          fontWeight={700}
          textAnchor="end"
          x={x + width}
          y={y - 6}
        >
          {formatCompactCurrency(payload.amount)}
        </text>
      ) : null}
    </g>
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
        <div className={`relative h-36 w-36 shrink-0 ${chartFocusReset}`}>
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                data={slices.filter((slice) => slice.value > 0)}
                dataKey="value"
                innerRadius="72%"
                isAnimationActive={false}
                nameKey="label"
                outerRadius="100%"
                paddingAngle={summary.total > 1 ? 2 : 0}
                stroke="#ffffff"
                strokeWidth={2}
              >
                {slices
                  .filter((slice) => slice.value > 0)
                  .map((slice) => (
                    <Cell fill={slice.color} key={slice.label} />
                  ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} wrapperStyle={{ zIndex: 10 }} />
            </PieChart>
          </ResponsiveContainer>
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
  const lastIndex = weeks.length - 1;

  return (
    <section aria-labelledby="weekly-income-title" className={`${cardClass} xl:order-5`}>
      <h2 className="text-lg font-bold text-ink" id="weekly-income-title">
        Ingresos por semana
      </h2>
      <div className={`mt-3 h-40 ${chartFocusReset}`}>
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            barCategoryGap={2}
            data={weeks}
            margin={{ bottom: 0, left: 0, right: 0, top: 22 }}
          >
            <XAxis
              axisLine={false}
              dataKey="weekStart"
              interval={0}
              // Etiquetas solo en los extremos, alineadas hacia adentro para
              // que no se corten en el borde.
              tick={(props) => {
                const { index, x, y } = props as { index: number; x: number; y: number };

                if (index !== 0 && index !== lastIndex) {
                  return <g />;
                }

                return (
                  <text
                    fill="#475569"
                    fontSize={12}
                    textAnchor={index === 0 ? "start" : "end"}
                    x={index === 0 ? x - 14 : x + 14}
                    y={y + 12}
                  >
                    {index === 0 ? firstLabel : "esta semana"}
                  </text>
                );
              }}
              tickLine={false}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={false}
            />
            {/* Las semanas en $0 se ven como una rayita (minPointSize) para que
                se lean las 8; la actual lleva su monto encima. */}
            <Bar
              dataKey="amount"
              isAnimationActive={false}
              minPointSize={3}
              shape={(props: unknown) => <IncomeBar {...(props as IncomeBarProps)} />}
            />
          </BarChart>
        </ResponsiveContainer>
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
