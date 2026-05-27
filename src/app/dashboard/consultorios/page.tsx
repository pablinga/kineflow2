"use client";

import { useState } from "react";
import { Building2, MailPlus, Plus, Trash2 } from "lucide-react";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { useClinicAdmin } from "@/hooks/useClinicAdmin";
import { weekdayLabels } from "@/hooks/useClinicLinks";
import { useRequireAuth } from "@/hooks/useRequireAuth";

const emptyClinic = {
  name: "",
  email: "",
  phone: "",
  address: "",
  color: "#0b97dc",
};

const emptyAvailability = {
  weekday: 1,
  startsAt: "09:00",
  endsAt: "13:00",
};

export default function ClinicsAdminPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { clinics, createClinic, error, inviteProfessional, loaded } =
    useClinicAdmin();
  const [clinicForm, setClinicForm] = useState(emptyClinic);
  const [inviteClinicId, setInviteClinicId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteColor, setInviteColor] = useState("#14b8a6");
  const [inviteRole, setInviteRole] = useState("kinesiologist");
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
        message="No hay una sesiÃ³n activa. Te estamos llevando al login."
        title="Redirigiendo..."
      />
    );
  }

  if (loading || !loaded) {
    return <DashboardLoading />;
  }

  async function handleCreateClinic(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("clinic");
    setActionError("");
    setMessage("");

    try {
      await createClinic(clinicForm);
      setClinicForm(emptyClinic);
      setMessage("Consultorio creado.");
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos crear el consultorio.",
      );
    } finally {
      setSaving("");
    }
  }

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("invite");
    setActionError("");
    setMessage("");

    try {
      await inviteProfessional({
        availability,
        clinicId: inviteClinicId,
        color: inviteColor,
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail("");
      setAvailability([emptyAvailability]);
      setMessage("InvitaciÃ³n creada en estado pendiente.");
    } catch (submitError) {
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "No pudimos crear la invitaciÃ³n.",
      );
    } finally {
      setSaving("");
    }
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="rounded-lg border border-ocean-100 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-ocean-700">
              Consultorios
            </p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              Invitaciones y horarios
            </h1>
            <p className="mt-2 text-slate-600">
              CargÃ¡ consultorios e invitÃ¡ kinesiolÃ³gos externos por email.
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
              onSubmit={handleCreateClinic}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-bold text-ink">
                    Nuevo consultorio
                  </h2>
                  <p className="text-sm text-slate-500">
                    Datos base para agenda y pacientes.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Nombre
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      setClinicForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    required
                    value={clinicForm.name}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    DirecciÃ³n
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      setClinicForm((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    value={clinicForm.address}
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Email
                    </span>
                    <input
                      className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        setClinicForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      type="email"
                      value={clinicForm.email}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-semibold text-slate-700">
                      Color
                    </span>
                    <input
                      className="mt-2 h-11 w-full rounded-lg border border-ocean-100 px-2"
                      onChange={(event) =>
                        setClinicForm((current) => ({
                          ...current,
                          color: event.target.value,
                        }))
                      }
                      type="color"
                      value={clinicForm.color}
                    />
                  </label>
                </div>
              </div>

              <button
                className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-ocean-600 px-5 text-sm font-semibold text-white transition hover:bg-ocean-700 disabled:opacity-60"
                disabled={saving === "clinic"}
                type="submit"
              >
                <Plus className="h-4 w-4" />
                {saving === "clinic" ? "Guardando..." : "Crear consultorio"}
              </button>
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
                    Invitar kinesiolÃ³go
                  </h2>
                  <p className="text-sm text-slate-500">
                    La invitaciÃ³n queda pendiente hasta su respuesta.
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
                    value={inviteClinicId}
                  >
                    <option value="">Seleccionar</option>
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Email del kinesiolÃ³go
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setInviteEmail(event.target.value)}
                    required
                    type="email"
                    value={inviteEmail}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-slate-700">
                    Rol
                  </span>
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) => setInviteRole(event.target.value)}
                    value={inviteRole}
                  />
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
                  <h3 className="font-bold text-ink">DÃ­as y horarios</h3>
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
                disabled={saving === "invite" || clinics.length === 0}
                type="submit"
              >
                <MailPlus className="h-4 w-4" />
                {saving === "invite" ? "Enviando..." : "Crear invitaciÃ³n"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}
