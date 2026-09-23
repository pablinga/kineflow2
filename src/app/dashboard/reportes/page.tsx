"use client";

import { Suspense, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { FileBarChart } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { Button } from "@/components/ui/Button";
import { type PaymentType } from "@/hooks/useAppointments";
import { useArtProviders } from "@/hooks/useArtProviders";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import { type ReportRow, useSessionsReport } from "@/hooks/useSessionsReport";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { formatCurrency } from "@/lib/payment-ui";

const paymentTypeOptions: Array<{ label: string; value: "all" | PaymentType }> = [
  { label: "Todos", value: "all" },
  { label: "Particular", value: "PARTICULAR" },
  { label: "Obra social", value: "OBRA_SOCIAL" },
  { label: "ART", value: "ART" },
];

function getDefaultMonth() {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";

  return `${year}-${month}`;
}

function downloadExcel(rows: ReportRow[], month: string, hideProfessional: boolean) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.map((row) => {
      const record: Record<string, string | number> = {
        Fecha: row.date,
        Hora: row.time,
        Paciente: row.patient,
      };

      if (!hideProfessional) {
        record.Profesional = row.professional;
      }

      record["Tipo de pago"] = row.paymentType;
      record.Proveedor = row.provider;
      record["N° afiliado"] = row.memberNumber;
      record.Monto = row.amount;
      record.Estado = row.status;

      return record;
    }),
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sesiones");
  XLSX.writeFile(workbook, `kineflow-sesiones-${month}.xlsx`);
}

function SessionsReportPageContent() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [month, setMonth] = useState(getDefaultMonth);
  const [paymentType, setPaymentType] = useState<"all" | PaymentType>("all");
  const [providerId, setProviderId] = useState("");
  const { providers: insuranceProviders } = useInsuranceProviders();
  const { providers: artProviders } = useArtProviders();
  const activeInsuranceProviders = insuranceProviders.filter(
    (provider) => provider.active,
  );
  const activeArtProviders = artProviders.filter((provider) => provider.active);
  const { error: reportError, loaded: reportLoaded, rows } = useSessionsReport({
    month,
    paymentType,
    providerId,
  });
  const hideProfessional = activeWorkspace?.type === "PERSONAL";
  const totalAmount = rows.reduce((total, row) => total + row.amount, 0);

  useEffect(() => {
    setProviderId("");
  }, [paymentType]);

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

  if (loading || !workspaceLoaded || !reportLoaded) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 pb-24 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col justify-between gap-4 rounded-lg border border-ocean-100 bg-white p-5 shadow-card md:flex-row md:items-center">
            <div>
              <p className="text-sm font-semibold text-ocean-700">Reportes</p>
              <h1 className="mt-1 text-3xl font-bold text-ink">
                Reporte mensual de sesiones
              </h1>
              <p className="mt-2 text-slate-600">
                Filtrá las sesiones del mes por tipo de pago y exportalas a
                Excel.
              </p>
            </div>
            <Button
              disabled={rows.length === 0}
              onClick={() => downloadExcel(rows, month, hideProfessional)}
              type="button"
            >
              Descargar Excel
            </Button>
          </header>

          {reportError ? (
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {reportError}
            </p>
          ) : null}

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Mes
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => setMonth(event.target.value)}
                  type="month"
                  value={month}
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-slate-700">
                  Tipo de pago
                </span>
                <select
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) =>
                    setPaymentType(event.target.value as "all" | PaymentType)
                  }
                  value={paymentType}
                >
                  {paymentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {paymentType === "OBRA_SOCIAL" ? (
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Obra social
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setProviderId(event.target.value)}
                    value={providerId}
                  >
                    <option value="">Todas</option>
                    {activeInsuranceProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {paymentType === "ART" ? (
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    ART
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setProviderId(event.target.value)}
                    value={providerId}
                  >
                    <option value="">Todas</option>
                    {activeArtProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </section>

          <section className="mt-6 grid gap-3 md:grid-cols-2">
            <article className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
              <p className="text-sm font-semibold text-slate-500">Sesiones</p>
              <p className="mt-2 text-xl font-bold text-ink">{rows.length}</p>
            </article>
            <article className="rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
              <p className="text-sm font-semibold text-slate-500">
                Monto total
              </p>
              <p className="mt-2 text-xl font-bold text-ink">
                {formatCurrency(totalAmount)}
              </p>
            </article>
          </section>

          <section className="mt-6 rounded-lg border border-ocean-100 bg-white shadow-card">
            <div className="flex items-center gap-3 border-b border-ocean-100 p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <FileBarChart className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-ink">
                  Sesiones del período
                </h2>
                <p className="text-sm text-slate-500">
                  {rows.length} registros encontrados.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className="bg-ocean-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Fecha</th>
                    <th className="px-5 py-3 font-semibold">Hora</th>
                    <th className="px-5 py-3 font-semibold">Paciente</th>
                    {hideProfessional ? null : (
                      <th className="px-5 py-3 font-semibold">Profesional</th>
                    )}
                    <th className="px-5 py-3 font-semibold">Tipo de pago</th>
                    <th className="px-5 py-3 font-semibold">Proveedor</th>
                    <th className="px-5 py-3 font-semibold">N° afiliado</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Monto
                    </th>
                    <th className="px-5 py-3 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ocean-100">
                  {rows.map((row, index) => (
                    <tr key={`${row.date}-${row.time}-${row.patient}-${index}`}>
                      <td className="px-5 py-4 font-semibold text-slate-600">
                        {row.date}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{row.time}</td>
                      <td className="px-5 py-4 text-ink">{row.patient}</td>
                      {hideProfessional ? null : (
                        <td className="px-5 py-4 text-slate-600">
                          {row.professional}
                        </td>
                      )}
                      <td className="px-5 py-4 text-slate-600">
                        {row.paymentType}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.provider}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.memberNumber}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-ink">
                        {formatCurrency(row.amount)}
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {row.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length === 0 ? (
              <div className="p-8 text-center">
                <p className="font-semibold text-ink">
                  No hay sesiones para los filtros seleccionados.
                </p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

export default function SessionsReportPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <SessionsReportPageContent />
    </Suspense>
  );
}
