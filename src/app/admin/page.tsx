import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Logo } from "@/components/ui/Logo";
import { hasAdminSession, isAdminPanelEnabled } from "@/lib/admin-auth";
import { toArgentinaDateValue } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { AdminLogoutButton } from "./AdminLogoutButton";

export const dynamic = "force-dynamic";

const CHART_WEEKS = 8;
const RECENT_LOGINS = 10;

type WeekKpis = {
  activated: number;
  active_accounts: number;
  appointments_attended: number;
  appointments_manual: number;
  appointments_no_show: number;
  appointments_online_link: number;
  appointments_online_qr: number;
  appointments_total: number;
  evolutions_new: number;
  patients_new: number;
  registrations_clinic: number;
  registrations_kine: number;
  subscriptions_canceled: number;
  subscriptions_new: number;
  trials_started: number;
  week_start: string;
};

type AccountRow = {
  account_type: string;
  appointments?: number;
  email: string;
  id: string;
  last_activity_at?: string;
  last_sign_in_at?: string;
  name: string;
};

type AdminKpis = {
  at_risk: AccountRow[];
  generated_at: string;
  top_accounts: AccountRow[];
  totals: {
    accounts: number;
    active_subscriptions: number;
    mrr: number;
    workspaces_with_online_booking: number;
  };
  weeks: WeekKpis[];
};

type PageProps = {
  searchParams: Promise<{ semana?: string }>;
};

/** Lunes (YYYY-MM-DD) de la semana que contiene la fecha dada. */
function getWeekStart(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function shiftDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Se renderiza en el servidor (UTC en Vercel): fijar la hora de Argentina.
const argentinaDateTime = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
  year: "numeric",
});

function formatDateTime(value: string) {
  return argentinaDateTime.format(new Date(value));
}

function formatShortDate(dateValue: string) {
  const [, month, day] = dateValue.split("-");
  return `${day}/${month}`;
}

function accountTypeLabel(accountType: string) {
  if (accountType === "CONSULTORIO") return "Clínica";
  if (accountType === "RECEPCION") return "Recepción";
  return "Kinesiólogo";
}

/**
 * Últimos ingresos según auth.users.last_sign_in_at: es el último login de
 * cada usuario (no cada login) y no se actualiza al renovar una sesión abierta.
 */
async function getRecentLogins(
  admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
): Promise<AccountRow[]> {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const recent = data.users
    .filter((user) => user.last_sign_in_at)
    .sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""))
    .slice(0, RECENT_LOGINS);

  if (recent.length === 0) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, account_type, full_name, organization_name")
    .in(
      "id",
      recent.map((user) => user.id),
    );
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  return recent.map((user) => {
    const profile = profileById.get(user.id);
    const email = user.email ?? "";
    return {
      account_type: profile?.account_type ?? "",
      email,
      id: user.id,
      last_sign_in_at: user.last_sign_in_at,
      name: profile?.organization_name?.trim() || profile?.full_name?.trim() || email,
    };
  });
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (current === previous) {
    return <span className="text-xs font-semibold text-slate-400">= semana anterior</span>;
  }

  const up = current > previous;
  const change = previous > 0 ? `${Math.round(((current - previous) / previous) * 100)}%` : "nuevo";

  return (
    <span className={`text-xs font-semibold ${up ? "text-emerald-700" : "text-red-700"}`}>
      {up ? "▲" : "▼"} {previous > 0 ? change.replace("-", "") : change} vs. {previous}
    </span>
  );
}

function KpiCard({
  detail,
  label,
  previous,
  value,
  valueLabel,
}: {
  detail?: string;
  label: string;
  previous?: number;
  value: number;
  valueLabel?: string;
}) {
  return (
    <article className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{valueLabel ?? value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-600">{detail}</p> : null}
      {previous !== undefined ? (
        <div className="mt-2">
          <Delta current={value} previous={previous} />
        </div>
      ) : null}
    </article>
  );
}

function AccountTable({
  emptyText,
  rows,
  title,
  valueHeader,
  valueOf,
}: {
  emptyText: string;
  rows: AccountRow[];
  title: string;
  valueHeader: string;
  valueOf: (row: AccountRow) => string;
}) {
  return (
    <section className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ocean-100 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3 font-bold">Cuenta</th>
                <th className="hidden py-2 pr-3 font-bold sm:table-cell">Tipo</th>
                <th className="py-2 text-right font-bold">{valueHeader}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-b border-ocean-50 last:border-b-0" key={row.id}>
                  <td className="py-2 pr-3">
                    <p className="font-semibold text-ink">{row.name}</p>
                    {row.name !== row.email ? (
                      <p className="break-all text-xs text-slate-500">{row.email}</p>
                    ) : null}
                    <p className="text-xs text-slate-500 sm:hidden">
                      {accountTypeLabel(row.account_type)}
                    </p>
                  </td>
                  <td className="hidden py-2 pr-3 text-slate-600 sm:table-cell">
                    {accountTypeLabel(row.account_type)}
                  </td>
                  <td className="py-2 text-right align-top font-semibold text-ink">{valueOf(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function AdminDashboardPage({ searchParams }: PageProps) {
  if (!isAdminPanelEnabled()) {
    notFound();
  }

  if (!(await hasAdminSession())) {
    redirect("/admin/login");
  }

  const { semana } = await searchParams;
  const currentWeekStart = getWeekStart(toArgentinaDateValue());
  const requested = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? getWeekStart(semana) : "";
  const weekStart =
    requested && requested <= currentWeekStart ? requested : currentWeekStart;

  const admin = getSupabaseAdminClient();
  const { data, error } = admin
    ? await admin.rpc("admin_weekly_kpis", { p_end_date: weekStart, p_weeks: CHART_WEEKS })
    : { data: null, error: new Error("Supabase no está configurado.") };
  const kpis = data as AdminKpis | null;
  const recentLogins = admin ? await getRecentLogins(admin).catch(() => null) : null;

  const weeks = kpis?.weeks ?? [];
  const week = weeks[weeks.length - 1];
  const previous = weeks[weeks.length - 2];
  const maxAppointments = Math.max(1, ...weeks.map((item) => item.appointments_total));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo compact />
        <AdminLogoutButton />
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ocean-700">Panel admin</p>
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">Reporte semanal</h1>
          <p className="mt-1 text-sm text-slate-600">
            Semana del {formatShortDate(weekStart)} al {formatShortDate(shiftDays(weekStart, 6))}
            {weekStart === currentWeekStart ? " (en curso)" : ""}
          </p>
        </div>
        <nav className="flex gap-2">
          <Link
            className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-ocean-100 bg-white px-3 text-sm font-semibold text-ocean-800 hover:bg-ocean-50"
            href={`/admin?semana=${shiftDays(weekStart, -7)}`}
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Link>
          {weekStart < currentWeekStart ? (
            <Link
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-ocean-100 bg-white px-3 text-sm font-semibold text-ocean-800 hover:bg-ocean-50"
              href={`/admin?semana=${shiftDays(weekStart, 7)}`}
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </nav>
      </div>

      {error || !kpis || !week ? (
        <Alert className="mt-6" tone="error">
          No pudimos calcular el reporte. {error?.message ?? ""}
        </Alert>
      ) : (
        <>
          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
            Crecimiento
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              detail={`${week.registrations_kine} kinesiólogos · ${week.registrations_clinic} clínicas`}
              label="Registraciones"
              previous={previous ? previous.registrations_kine + previous.registrations_clinic : undefined}
              value={week.registrations_kine + week.registrations_clinic}
            />
            <KpiCard
              detail="Cargaron un paciente o turno en sus primeros 7 días"
              label="Activación"
              value={week.activated}
              valueLabel={`${week.activated} de ${week.registrations_kine + week.registrations_clinic}`}
            />
            <KpiCard
              label="Pruebas iniciadas"
              previous={previous?.trials_started}
              value={week.trials_started}
            />
            <KpiCard
              detail={`${week.subscriptions_canceled} cancelaciones`}
              label="Suscripciones nuevas"
              previous={previous?.subscriptions_new}
              value={week.subscriptions_new}
            />
          </div>

          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">Uso</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              detail={`${week.appointments_manual} cargados a mano`}
              label="Turnos generados"
              previous={previous?.appointments_total}
              value={week.appointments_total}
            />
            <KpiCard
              detail={`${week.appointments_online_link} por link · ${week.appointments_online_qr} por QR${
                percent(week.appointments_online_link + week.appointments_online_qr, week.appointments_total) !== null
                  ? ` · ${percent(week.appointments_online_link + week.appointments_online_qr, week.appointments_total)}% del total`
                  : ""
              }`}
              label="Reservas online"
              previous={
                previous ? previous.appointments_online_link + previous.appointments_online_qr : undefined
              }
              value={week.appointments_online_link + week.appointments_online_qr}
            />
            <KpiCard
              detail="Crearon turnos, pacientes o evoluciones"
              label="Cuentas activas"
              previous={previous?.active_accounts}
              value={week.active_accounts}
            />
            <KpiCard
              detail={`${week.appointments_no_show} de ${week.appointments_attended + week.appointments_no_show} turnos marcados`}
              label="Ausentismo"
              value={week.appointments_no_show}
              valueLabel={
                percent(week.appointments_no_show, week.appointments_attended + week.appointments_no_show) === null
                  ? "—"
                  : `${percent(week.appointments_no_show, week.appointments_attended + week.appointments_no_show)}%`
              }
            />
            <KpiCard
              label="Pacientes nuevos"
              previous={previous?.patients_new}
              value={week.patients_new}
            />
            <KpiCard
              label="Evoluciones registradas"
              previous={previous?.evolutions_new}
              value={week.evolutions_new}
            />
          </div>

          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-slate-500">
            Totales actuales
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Cuentas" value={kpis.totals.accounts} />
            <KpiCard label="Suscripciones activas" value={kpis.totals.active_subscriptions} />
            <KpiCard
              detail="Suma de planes mensuales activos"
              label="MRR"
              value={kpis.totals.mrr}
              valueLabel={formatCurrency(Number(kpis.totals.mrr))}
            />
            <KpiCard
              detail="Recibieron al menos una reserva online"
              label="Espacios con reserva online"
              value={kpis.totals.workspaces_with_online_booking}
            />
          </div>

          <section className="mt-8 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:p-5">
            <h2 className="text-lg font-bold text-ink">Turnos generados por semana</h2>
            <div className="mt-2 flex gap-4 text-xs font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-ocean-700" /> Manual
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-3 rounded-sm bg-emerald-500" /> Online
              </span>
            </div>
            <div className="mt-4 flex h-48 items-end gap-2 sm:gap-4">
              {weeks.map((item) => {
                const online = item.appointments_online_link + item.appointments_online_qr;
                return (
                  <div className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" key={item.week_start}>
                    <span className="text-xs font-bold text-ink">{item.appointments_total}</span>
                    <div
                      className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t"
                      style={{ height: `${(item.appointments_total / maxAppointments) * 100}%` }}
                      title={`${item.appointments_manual} manual · ${online} online`}
                    >
                      <div
                        className="bg-ocean-700"
                        style={{ height: `${percent(item.appointments_manual, item.appointments_total) ?? 0}%` }}
                      />
                      <div
                        className="bg-emerald-500"
                        style={{ height: `${percent(online, item.appointments_total) ?? 0}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500">{formatShortDate(item.week_start)}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <AccountTable
              emptyText="No hubo turnos esta semana."
              rows={kpis.top_accounts}
              title="Cuentas con más turnos"
              valueHeader="Turnos"
              valueOf={(row) => String(row.appointments ?? 0)}
            />
            <AccountTable
              emptyText="Ninguna cuenta dejó de tener actividad."
              rows={kpis.at_risk}
              title="En riesgo: activas la semana anterior, sin actividad esta"
              valueHeader="Última actividad"
              valueOf={(row) => (row.last_activity_at ? formatDateTime(row.last_activity_at) : "—")}
            />
          </div>

          <div className="mt-4">
            {recentLogins ? (
              <AccountTable
                emptyText="Todavía no hay ingresos registrados."
                rows={recentLogins}
                title="Últimos ingresos"
                valueHeader="Último login"
                valueOf={(row) => (row.last_sign_in_at ? formatDateTime(row.last_sign_in_at) : "—")}
              />
            ) : (
              <Alert tone="error">No pudimos cargar los últimos ingresos.</Alert>
            )}
          </div>

          <p className="mt-6 text-xs text-slate-400">
            Semanas de lunes a domingo, hora de Argentina. Generado {formatDateTime(kpis.generated_at)}.
          </p>
        </>
      )}
    </main>
  );
}
