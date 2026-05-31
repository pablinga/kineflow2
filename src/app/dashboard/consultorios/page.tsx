"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, MailPlus, Plus, Search, Trash2, UserRound } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import {
  type ProfessionalSearchResult,
  useClinicAdmin,
} from "@/hooks/useClinicAdmin";
import { weekdayLabels } from "@/hooks/useClinicLinks";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useSubscriptionPlan } from "@/hooks/useSubscriptionPlan";
import { shouldShowClinicFeatures } from "@/lib/features";

const emptyAvailability = {
  weekday: 1,
  startsAt: "09:00",
  endsAt: "13:00",
};

export default function ClinicsAdminPage() {
  const router = useRouter();
  const clinicsEnabled = shouldShowClinicFeatures();

  const {
    accountType,
    authError,
    loading,
    redirecting,
  } = useRequireAuth();
  const { loaded: planLoaded, plan } = useSubscriptionPlan();
  const {
    clinics,
    error,
    inviteProfessional,
    loaded,
    searchProfessionalByLicense,
  } = useClinicAdmin();
  const [licenseQuery, setLicenseQuery] = useState("");
  const [foundProfessional, setFoundProfessional] =
    useState<ProfessionalSearchResult | null>(null);
  const [inviteClinicId, setInviteClinicId] = useState("");
  const [inviteColor, setInviteColor] = useState("#14b8a6");

  useEffect(() => {
    if (!clinicsEnabled) {
      router.replace("/dashboard");
    }
  }, [clinicsEnabled, router]);

  if (!clinicsEnabled) {
    return (
      <DashboardLoading
        message="Esta funcionalidad estara disponible en una etapa posterior."
        title="Redirigiendo..."
      />
    );
  }
  const [availability, setAvailability] = useState([emptyAvailability]);
  const [saving, setSaving] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");

  if (authError) {
    return <DashboardLoading error={authError} />;
  }

  if (redirecting) {
    return (
      <DashboardLoading
        message="No hay una sesión activá. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !loaded || !planLoaded) {
    return <DashboardLoading />;
  }

  if (accountType !== "CONSULTORIO") {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <section className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-ocean-100 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-ink">Acceso no disponible</h1>
            <p className="mt-2 text-slate-600">
              Esta seccion es solo para cuentas de consultorio.
            </p>
          </div>
        </section>
      </main>
    );
  }

  const hasActiveClinicPlan =
    plan.estadoPlan === "ACTIVO" && plan.plan.startsWith("CONSULTORIO_");

  if (!hasActiveClinicPlan) {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <section className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-amber-100 bg-amber-50 p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-amber-950">
              Plan Consultorio requerido
            </h1>
            <p className="mt-2 leading-6 text-amber-800">
              Para invitar kinesiólogos y gestionar profesionales necesitás una
              suscripción activa del Plan Consultorio.
            </p>
          </div>
        </section>
      </main>
    );
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("search");
    setActionError("");
    setMessage("");
    setFoundProfessional(null);

    try {
      const professional = await searchProfessionalByLicense(licenseQuery);

      if (!professional) {
        setActionError("No encontramos un kinesiólogo registrado con esa matrícula.");
        return;
      }

      setFoundProfessional(professional);
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos buscar el profesional.",
      );
    } finally {
      setSaving("");
    }
  }

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!foundProfessional) {
      setActionError("Primero busca y seleccióna un kinesiólogo registrado.");
      return;
    }

    setSaving("invite");
    setActionError("");
    setMessage("");

    try {
      await inviteProfessional({
        availability,
        clinicId: selectedClinicId,
        color: inviteColor,
        maxProfessionals: plan.cantidadKinesiologos,
        professional: foundProfessional,
      });
      setLicenseQuery("");
      setFoundProfessional(null);
      setAvailability([emptyAvailability]);
      setMessage("Invitación creada en estado pendiente.");
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos crear la invitación.",
      );
    } finally {
      setSaving("");
    }
  }

  const selectedClinicId = inviteClinicId || clinics[0]?.id || "";

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">
              Profesionales
            </p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Agregar kinesiólogo
            </h1>
            <p className="mt-2 text-slate-600">
              Busca kinesiólogos registrados por matrícula y enviales una
              invitación de vinculacion.
            </p>
          </header>

          {error || actionError ? (
            <p className="mt-6 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionError || error}
            </p>
          ) : null}
          {message ? (
            <p className="mt-6 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {message}
            </p>
          ) : null}

          <section className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <form
              className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
              onSubmit={handleSearch}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                  <Search className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    Buscar por matrícula
                  </h2>
                  <p className="text-sm text-slate-500">
                    Solo se pueden invitar usuarios ya registrados.
                  </p>
                </div>
              </div>

              <label className="mt-5 block">
                <span className="text-sm font-semibold text-slate-700">
                  Matrícula
                </span>
                <input
                  className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                  onChange={(event) => setLicenseQuery(event.target.value)}
                  placeholder="MN 12345"
                  required
                  value={licenseQuery}
                />
              </label>

              <button
                className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                disabled={saving === "search"}
                type="submit"
              >
                <Search className="h-4 w-4" />
                {saving === "search" ? "Buscando..." : "Buscar"}
              </button>

              {foundProfessional ? (
                <div className="mt-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
                      <UserRound className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-ink">
                        {foundProfessional.fullName}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Matrícula {foundProfessional.licenseNumber}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {foundProfessional.specialty}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        {foundProfessional.maskedEmail}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </form>

            <form
              className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm"
              onSubmit={handleInvite}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <MailPlus className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    Enviar invitación
                  </h2>
                  <p className="text-sm text-slate-500">
                    Define el color y los horarios de atencion.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Consultorio
                  </span>
                  <select
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setInviteClinicId(event.target.value)}
                    required
                    value={selectedClinicId}
                  >
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Color en agenda
                  </span>
                  <input
                    className="mt-2 h-11 w-full rounded-lg border border-ocean-100 px-2"
                    onChange={(event) => setInviteColor(event.target.value)}
                    type="color"
                    value={inviteColor}
                  />
                </label>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-ink">Dias y horarios</h3>
                  <button
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                    onClick={() =>
                      setAvailability((current) => [
                        ...current,
                        emptyAvailability,
                      ])
                    }
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Agregar
                  </button>
                </div>

                {availability.map((item, index) => (
                  <div
                    className="grid gap-3 rounded-lg border border-ocean-100 p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
                    key={`${item.weekday}-${index}`}
                  >
                    <select
                      className="min-h-11 rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((availabilityItem, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...availabilityItem,
                                  weekday: Number(event.target.value),
                                }
                              : availabilityItem,
                          ),
                        )
                      }
                      value={item.weekday}
                    >
                      {weekdayLabels.map((label, weekday) => (
                        <option key={label} value={weekday}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="min-h-11 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((availabilityItem, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...availabilityItem,
                                  startsAt: event.target.value,
                                }
                              : availabilityItem,
                          ),
                        )
                      }
                      required
                      type="time"
                      value={item.startsAt}
                    />
                    <input
                      className="min-h-11 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        setAvailability((current) =>
                          current.map((availabilityItem, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...availabilityItem,
                                  endsAt: event.target.value,
                                }
                              : availabilityItem,
                          ),
                        )
                      }
                      required
                      type="time"
                      value={item.endsAt}
                    />
                    <button
                      aria-label="Eliminar horario"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-rose-100 px-3 text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      disabled={availability.length === 1}
                      onClick={() =>
                        setAvailability((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                disabled={
                  saving === "invite" ||
                  clinics.length === 0 ||
                  !foundProfessional
                }
                type="submit"
              >
                <BadgeCheck className="h-4 w-4" />
                {saving === "invite" ? "Enviando..." : "Enviar invitación"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
