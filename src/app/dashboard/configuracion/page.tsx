"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarOff,
  CheckCircle2,
  Palette,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { getFriendlyErrorMessage } from "@/lib/error-messages";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  WORKSPACE_COLOR_OPTIONS,
  type WorkspaceSettings,
  useWorkspaceSettings,
} from "@/hooks/useWorkspaceSettings";
import { useInsuranceProviders } from "@/hooks/useInsuranceProviders";
import { useWorkspaceBlockedDates } from "@/hooks/useWorkspaceBlockedDates";

type FormState = {
  address: string;
  color: string;
  defaultSessionDurationMinutes: string;
  defaultSessionPrice: string;
  email: string;
  name: string;
  phone: string;
};

const emptyForm: FormState = {
  address: "",
  color: WORKSPACE_COLOR_OPTIONS[0],
  defaultSessionDurationMinutes: "",
  defaultSessionPrice: "",
  email: "",
  name: "",
  phone: "",
};

function toFormState(settings: WorkspaceSettings | null): FormState {
  if (!settings) {
    return emptyForm;
  }

  return {
    address: settings.address,
    color: settings.color,
    defaultSessionDurationMinutes:
      settings.defaultSessionDurationMinutes?.toString() ?? "",
    defaultSessionPrice: settings.defaultSessionPrice?.toString() ?? "",
    email: settings.email,
    name: settings.name,
    phone: settings.phone,
  };
}

function toNullableNumber(value: string) {
  const normalizedValue = value.trim().replace(",", ".");

  if (!normalizedValue) {
    return null;
  }

  const parsed = Number(normalizedValue);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

export default function WorkspaceSettingsPage() {
  const { authError, loading, redirecting } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const {
    error: settingsError,
    loaded: settingsLoaded,
    settings,
    updateSettings,
  } = useWorkspaceSettings();
  const {
    addProvider,
    deleteProvider,
    error: providersError,
    loaded: providersLoaded,
    providers,
    updateProvider,
  } = useInsuranceProviders();
  const {
    addBlockedDate,
    blockedDates,
    deleteBlockedDate,
    error: blockedDatesError,
    loaded: blockedDatesLoaded,
  } = useWorkspaceBlockedDates();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [blockedDateForm, setBlockedDateForm] = useState({
    blockedDate: "",
    reason: "",
  });
  const [providerName, setProviderName] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBlockedDate, setSavingBlockedDate] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loaded =
    workspaceLoaded && settingsLoaded && providersLoaded && blockedDatesLoaded;
  const canManage = activeWorkspace?.role === "ADMIN";
  const combinedError = useMemo(
    () =>
      [settingsError, providersError, blockedDatesError, error]
        .filter(Boolean)
        .join(" "),
    [blockedDatesError, error, providersError, settingsError],
  );

  useEffect(() => {
    setForm(toFormState(settings));
  }, [settings]);

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage) {
      return;
    }

    setSavingSettings(true);
    setError("");
    setMessage("");

    try {
      if (!form.name.trim()) {
        throw new Error("Ingresá un nombre para el espacio.");
      }

      const duration = toNullableNumber(form.defaultSessionDurationMinutes);
      const price = toNullableNumber(form.defaultSessionPrice);

      if (
        duration !== null &&
        (!Number.isInteger(duration) || duration <= 0)
      ) {
        throw new Error("La duración debe ser un número entero mayor a 0.");
      }

      if (price !== null && price < 0) {
        throw new Error("El precio sugerido no puede ser negativo.");
      }

      await updateSettings({
        address: form.address,
        color: form.color,
        defaultSessionDurationMinutes: duration,
        defaultSessionPrice: price,
        email: form.email,
        name: form.name,
        phone: form.phone,
      });
      setMessage("Configuración actualizada.");
    } catch (saveError) {
      setError(
        getFriendlyErrorMessage(
          saveError,
          "No pudimos guardar la configuración.",
        ),
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleAddBlockedDate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !blockedDateForm.blockedDate) {
      return;
    }

    setSavingBlockedDate(true);
    setError("");
    setMessage("");

    try {
      await addBlockedDate(blockedDateForm.blockedDate, blockedDateForm.reason);
      setBlockedDateForm({ blockedDate: "", reason: "" });
      setMessage("Día bloqueado agregado.");
    } catch (saveError) {
      setError(
        getFriendlyErrorMessage(saveError, "No pudimos bloquear ese día."),
      );
    } finally {
      setSavingBlockedDate(false);
    }
  }

  async function handleAddProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManage || !providerName.trim()) {
      return;
    }

    setSavingProvider(true);
    setError("");
    setMessage("");

    try {
      await addProvider(providerName);
      setProviderName("");
      setMessage("Obra social agregada.");
    } catch (saveError) {
      setError(
        getFriendlyErrorMessage(saveError, "No pudimos agregar la obra social."),
      );
    } finally {
      setSavingProvider(false);
    }
  }

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

  if (loading || !loaded) {
    return <DashboardLoading />;
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer maxWidth="6xl">
        <PageHeader
          description="Ajustá los datos que ven tus pacientes y las reglas que afectan la práctica diaria."
          eyebrow="Configuración"
          title="Tu espacio de trabajo"
        />

        {!canManage ? (
          <Alert className="mt-4" tone="warning" title="Solo lectura">
            Podés ver esta configuración, pero solo un administrador del espacio
            puede modificarla.
          </Alert>
        ) : null}

        <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={handleSaveSettings}>
          <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <Settings className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-ink">Datos de contacto</h2>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="block">
                <FieldLabel required>Nombre</FieldLabel>
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                  disabled={!canManage}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  required
                  value={form.name}
                />
              </label>
              <label className="block">
                <FieldLabel>Dirección</FieldLabel>
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                  disabled={!canManage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      address: event.target.value,
                    }))
                  }
                  value={form.address}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Teléfono</FieldLabel>
                  <input
                    className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    value={form.phone}
                  />
                </label>
                <label className="block">
                  <FieldLabel>Email</FieldLabel>
                  <input
                    className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                    disabled={!canManage}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    type="email"
                    value={form.email}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <CheckCircle2 className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-ink">
                Configuración de sesiones
              </h2>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="block">
                <FieldLabel>Precio sugerido</FieldLabel>
                <input
                  className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                  disabled={!canManage}
                  min="0"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      defaultSessionPrice: event.target.value,
                    }))
                  }
                  step="0.01"
                  type="number"
                  value={form.defaultSessionPrice}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <FieldLabel>Duración predeterminada (minutos)</FieldLabel>
                  <input
                    className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                    disabled={!canManage}
                    min="1"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        defaultSessionDurationMinutes: event.target.value,
                      }))
                    }
                    step="1"
                    type="number"
                    value={form.defaultSessionDurationMinutes}
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6 lg:col-span-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <Palette className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-ink">Color del espacio</h2>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {WORKSPACE_COLOR_OPTIONS.map((color) => (
                <button
                  aria-label={`Elegir color ${color}`}
                  className={`h-11 w-11 rounded-lg border-2 transition ${
                    form.color === color
                      ? "border-ink ring-2 ring-ocean-200"
                      : "border-white hover:border-ocean-200"
                  }`}
                  disabled={!canManage}
                  key={color}
                  onClick={() => setForm((current) => ({ ...current, color }))}
                  style={{ backgroundColor: color }}
                  type="button"
                />
              ))}
            </div>
          </section>

          {canManage ? (
            <div className="flex justify-end lg:col-span-2">
              <Button disabled={savingSettings} type="submit">
                <Save className="h-4 w-4" />
                {savingSettings ? "Guardando..." : "Guardar configuración"}
              </Button>
            </div>
          ) : null}
        </form>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <CalendarOff className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-ink">Días bloqueados</h2>
            </div>

            <form className="mt-5 grid gap-3 sm:grid-cols-[10rem_1fr_auto]" onSubmit={handleAddBlockedDate}>
              <input
                className="min-h-11 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                disabled={!canManage}
                onChange={(event) =>
                  setBlockedDateForm((current) => ({
                    ...current,
                    blockedDate: event.target.value,
                  }))
                }
                required
                type="date"
                value={blockedDateForm.blockedDate}
              />
              <input
                className="min-h-11 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                disabled={!canManage}
                onChange={(event) =>
                  setBlockedDateForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Motivo opcional"
                value={blockedDateForm.reason}
              />
              <Button disabled={!canManage || savingBlockedDate} type="submit">
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </form>

            <div className="mt-5 space-y-3">
              {blockedDates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
                  No hay días bloqueados.
                </div>
              ) : null}
              {blockedDates.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-ocean-100 p-3"
                  key={item.id}
                >
                  <div>
                    <p className="text-sm font-bold capitalize text-ink">
                      {formatDate(item.blockedDate)}
                    </p>
                    {item.reason ? (
                      <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                    ) : null}
                  </div>
                  <button
                    aria-label="Eliminar día bloqueado"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    disabled={!canManage}
                    onClick={async () => {
                      try {
                        await deleteBlockedDate(item.id);
                        setMessage("Día bloqueado eliminado.");
                      } catch (deleteError) {
                        setError(
                          getFriendlyErrorMessage(
                            deleteError,
                            "No pudimos eliminar el día bloqueado.",
                          ),
                        );
                      }
                    }}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold text-ink">Obras sociales</h2>
            </div>

            <form className="mt-5 flex flex-col gap-3 sm:flex-row" onSubmit={handleAddProvider}>
              <input
                className="min-h-11 flex-1 rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                disabled={!canManage}
                onChange={(event) => setProviderName(event.target.value)}
                placeholder="Nombre de la obra social"
                required
                value={providerName}
              />
              <Button disabled={!canManage || savingProvider} type="submit">
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </form>

            <div className="mt-5 space-y-3">
              {providers.length === 0 ? (
                <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-4 text-sm font-semibold text-ocean-800">
                  No hay obras sociales cargadas.
                </div>
              ) : null}
              {providers.map((provider) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-ocean-100 p-3"
                  key={provider.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">
                      {provider.name}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {provider.active ? "Activa" : "Inactiva"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input
                        checked={provider.active}
                        className="h-4 w-4 accent-ocean-600"
                        disabled={!canManage}
                        onChange={async (event) => {
                          try {
                            await updateProvider(provider.id, {
                              active: event.target.checked,
                            });
                            setMessage("Obra social actualizada.");
                          } catch (updateError) {
                            setError(
                              getFriendlyErrorMessage(
                                updateError,
                                "No pudimos actualizar la obra social.",
                              ),
                            );
                          }
                        }}
                        type="checkbox"
                      />
                      Activa
                    </label>
                    <button
                      aria-label="Eliminar obra social"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      disabled={!canManage}
                      onClick={async () => {
                        try {
                          await deleteProvider(provider.id);
                          setMessage("Obra social eliminada.");
                        } catch (deleteError) {
                          setError(
                            getFriendlyErrorMessage(
                              deleteError,
                              "No pudimos eliminar la obra social.",
                            ),
                          );
                        }
                      }}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {combinedError ? (
          <Alert className="mt-4" tone="error">
            {combinedError}
          </Alert>
        ) : null}
        {message ? (
          <Alert className="mt-4" tone="success">
            {message}
          </Alert>
        ) : null}
      </PageContainer>
    </main>
  );
}
