"use client";

import { CheckCircle2, Clock3, MapPin, XCircle } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  formatAvailability,
  useClinicLinks,
  weekdayLabels,
} from "@/hooks/useClinicLinks";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const statusStyles = {
  pending: "bg-amber-50 text-amber-800",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  inactive: "bg-slate-100 text-slate-700",
};

export default function MyClinicsPage() {
  const { accountType, authError, loading, redirecting } = useRequireAuth();
  const {
    acceptInvitation,
    error,
    links,
    loaded,
    rejectInvitation,
  } = useClinicLinks();

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesiÃ³n activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !loaded) {
    return <DashboardLoading />;
  }

  if (accountType !== "KINESIOLOGO") {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <section className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-ink">Acceso no disponible</h1>
            <p className="mt-2 text-slate-600">
              Esta seccion es solo para kinesiologos independientes.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">
              Mis consultorios
            </p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              VÃ­nculos e invitaciones
            </h1>
            <p className="mt-2 text-slate-600">
              RevisÃ¡ consultorios asociados, horarios asignados y colores de
              agenda.
            </p>
          </header>

          {error ? (
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {links.map((link) => (
              <article
                className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
                key={link.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: link.color }}
                      />
                      <h2 className="truncate text-xl font-bold text-ink">
                        {link.clinicName}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      Rol: {link.role}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
                      statusStyles[link.status]
                    }`}
                  >
                    {link.statusLabel}
                  </span>
                </div>

                <div className="mt-5 space-y-3 text-sm text-slate-600">
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-ocean-600" />
                    {link.clinicAddress}
                  </p>
                  <p className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-ocean-600" />
                    {formatAvailability(link.availability)}
                  </p>
                </div>

                {link.availability.length > 0 ? (
                  <div className="mt-5 grid gap-2">
                    {link.availability.map((availability) => (
                      <div
                        className="flex items-center justify-between rounded-lg bg-ocean-50 px-3 py-2 text-sm"
                        key={availability.id}
                      >
                        <span className="font-semibold text-ink">
                          {weekdayLabels[availability.weekday]}
                        </span>
                        <span className="font-medium text-ocean-800">
                          {availability.startsAt} a {availability.endsAt}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {link.status === "pending" ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      onClick={() => acceptInvitation(link.id)}
                      type="button"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aceptar
                    </button>
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                      onClick={() => rejectInvitation(link.id)}
                      type="button"
                    >
                      <XCircle className="h-4 w-4" />
                      Rechazar
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </section>

          {links.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-ocean-200 bg-white p-8 text-center shadow-sm">
              <p className="font-semibold text-ink">
                TodavÃ­a no tenÃ©s consultorios vinculados.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                Cuando un consultorio te invite, vas a poder aceptar o rechazar
                desde esta secciÃ³n.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
