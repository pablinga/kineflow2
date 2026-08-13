"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  Check,
  Clipboard,
  ExternalLink,
  Palette,
  Plus,
  RefreshCw,
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
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { weekdayLabels } from "@/hooks/useClinicLinks";
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

type AvailabilityInput = {
  weekday: number;
  startsAt: string;
  endsAt: string;
};

type AvailabilityRow = {
  ends_at: string;
  starts_at: string;
  weekday: number;
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

const emptyAvailability: AvailabilityInput = {
  weekday: 1,
  startsAt: "09:00",
  endsAt: "13:00",
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

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

function validateAvailability(availability: AvailabilityInput[]) {
  const invalidAvailability = availability.some(
    (item) => !item.startsAt || !item.endsAt || item.startsAt >= item.endsAt,
  );

  if (invalidAvailability) {
    throw new Error("Revisá que cada franja tenga un horario válido.");
  }
}

function formatAvailabilitySummary(availability: AvailabilityInput[]) {
  if (availability.length === 0) {
    return "Todavía no configuraste horarios para reservas online.";
  }

  return availability
    .map(
      (item) =>
        `${weekdayLabels[item.weekday]} ${item.startsAt} a ${item.endsAt}`,
    )
    .join(", ");
}

export default function WorkspaceSettingsPage() {
  const { accountType, authError, loading, redirecting, user } = useRequireAuth();
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
  const [availability, setAvailability] = useState<AvailabilityInput[]>([]);
  const [availabilityLoaded, setAvailabilityLoaded] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [copying, setCopying] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBlockedDate, setSavingBlockedDate] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const effectiveAccountType =
    activeWorkspace?.type === "CLINICA" ? "CONSULTORIO" : accountType;
  const showIndependentBookingSettings =
    effectiveAccountType === "KINESIOLOGO" &&
    activeWorkspace?.type === "PERSONAL";
  const loaded =
    workspaceLoaded &&
    settingsLoaded &&
    providersLoaded &&
    blockedDatesLoaded &&
    availabilityLoaded;
  const canManage = activeWorkspace?.role === "ADMIN";
  const publicBookingLink = activeWorkspace
    ? `https://kineflow.ar/reservar/${activeWorkspace.id}`
    : "";
  const sortedAvailability = useMemo(
    () =>
      [...availability].sort(
        (left, right) =>
          left.weekday - right.weekday ||
          left.startsAt.localeCompare(right.startsAt),
      ),
    [availability],
  );
  const combinedError = useMemo(
    () =>
      [settingsError, providersError, blockedDatesError, error]
        .filter(Boolean)
        .join(" "),
    [blockedDatesError, error, providersError, settingsError],
  );

  const loadAvailability = useCallback(async () => {
    if (!workspaceLoaded) {
      return;
    }

    if (!showIndependentBookingSettings || !user) {
      setAvailability([]);
      setAvailabilityLoaded(true);
      return;
    }

    setAvailabilityLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("independent_availability")
        .select("weekday, starts_at, ends_at")
        .eq("owner_id", user.id)
        .eq("active", true)
        .order("weekday", { ascending: true })
        .order("starts_at", { ascending: true });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setAvailability(
        ((data ?? []) as AvailabilityRow[]).map((item) => ({
          weekday: item.weekday,
          startsAt: normalizeTime(item.starts_at),
          endsAt: normalizeTime(item.ends_at),
        })),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar tus horarios de reserva online.",
        ),
      );
    } finally {
      setAvailabilityLoaded(true);
    }
  }, [showIndependentBookingSettings, user, workspaceLoaded]);

  useEffect(() => {
    setForm(toFormState(settings));
  }, [settings]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  function updateAvailabilityRow(
    index: number,
    field: keyof AvailabilityInput,
    value: string | number,
  ) {
    setAvailability((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  }

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

  async function handleSaveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !showIndependentBookingSettings || !canManage) {
      return;
    }

    setSavingAvailability(true);
    setError("");
    setMessage("");

    try {
      validateAvailability(availability);

      const supabase = getSupabaseClient();
      const { error: deleteError } = await supabase
        .from("independent_availability")
        .delete()
        .eq("owner_id", user.id);

      if (deleteError) {
        throw new Error(mapSupabaseError(deleteError));
      }

      if (availability.length > 0) {
        const { error: insertError } = await supabase
          .from("independent_availability")
          .insert(
            availability.map((item) => ({
              active: true,
              ends_at: item.endsAt,
              owner_id: user.id,
              starts_at: item.startsAt,
              weekday: item.weekday,
            })),
          );

        if (insertError) {
          throw new Error(mapSupabaseError(insertError));
        }
      }

      setMessage("Horarios de reserva online actualizados.");
      await loadAvailability();
    } catch (saveError) {
      setError(
        getFriendlyErrorMessage(
          saveError,
          "No pudimos guardar tus horarios de reserva online.",
        ),
      );
    } finally {
      setSavingAvailability(false);
    }
  }

  async function handleCopyLink() {
    if (!publicBookingLink) {
      return;
    }

    setCopying(true);
    setMessage("");
    setError("");

    try {
      await navigator.clipboard.writeText(publicBookingLink);
      setMessage("Link copiado.");
    } catch (copyError) {
      setError(
        getFriendlyErrorMessage(copyError, "No pudimos copiar el link."),
      );
    } finally {
      window.setTimeout(() => setCopying(false), 800);
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

        {showIndependentBookingSettings ? (
          <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <form
              className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6"
              onSubmit={handleSaveAvailability}
            >
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-bold text-ink">
                    Días y horarios de atención
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Cada franja activa turnos disponibles de forma recurrente
                    para ese día.
                  </p>
                </div>
                <button
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:opacity-50"
                  disabled={!canManage}
                  onClick={() =>
                    setAvailability((current) => [
                      ...current,
                      { ...emptyAvailability },
                    ])
                  }
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                  Agregar
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {availability.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-ocean-200 bg-ocean-50 px-4 py-5 text-sm font-medium text-ocean-800">
                    No hay horarios configurados. Agregá una franja para
                    empezar a recibir reservas online.
                  </div>
                ) : null}

                {availability.map((item, index) => (
                  <div
                    className="grid gap-3 rounded-lg border border-ocean-100 p-3 sm:grid-cols-[1fr_7rem_7rem_auto]"
                    key={`${item.weekday}-${item.startsAt}-${index}`}
                  >
                    <label className="block">
                      <FieldLabel className="text-xs font-semibold text-slate-600">
                        Día
                      </FieldLabel>
                      <select
                        className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                        disabled={!canManage}
                        onChange={(event) =>
                          updateAvailabilityRow(
                            index,
                            "weekday",
                            Number(event.target.value),
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
                    </label>
                    <label className="block">
                      <FieldLabel
                        className="text-xs font-semibold text-slate-600"
                        required
                      >
                        Inicio
                      </FieldLabel>
                      <input
                        className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                        disabled={!canManage}
                        onChange={(event) =>
                          updateAvailabilityRow(
                            index,
                            "startsAt",
                            event.target.value,
                          )
                        }
                        required
                        type="time"
                        value={item.startsAt}
                      />
                    </label>
                    <label className="block">
                      <FieldLabel
                        className="text-xs font-semibold text-slate-600"
                        required
                      >
                        Fin
                      </FieldLabel>
                      <input
                        className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
                        disabled={!canManage}
                        onChange={(event) =>
                          updateAvailabilityRow(
                            index,
                            "endsAt",
                            event.target.value,
                          )
                        }
                        required
                        type="time"
                        value={item.endsAt}
                      />
                    </label>
                    <button
                      aria-label="Eliminar horario"
                      className="inline-flex min-h-11 items-center justify-center self-end rounded-lg border border-rose-100 px-3 text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      disabled={!canManage}
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

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  disabled={savingAvailability}
                  onClick={loadAvailability}
                  type="button"
                  variant="secondary"
                >
                  <RefreshCw className="h-4 w-4" />
                  Recargar
                </Button>
                <Button disabled={!canManage || savingAvailability} type="submit">
                  <Save className="h-4 w-4" />
                  {savingAvailability ? "Guardando..." : "Guardar horarios"}
                </Button>
              </div>
            </form>

            <aside className="space-y-4">
              <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <CalendarClock className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-bold text-ink">Tu link público</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Compartilo con pacientes para que elijan un horario libre.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-ocean-100 bg-ocean-50 px-3 py-3 text-sm font-semibold text-ocean-900">
                  <p className="break-all">{publicBookingLink}</p>
                </div>

                <div className="mt-4 grid gap-3">
                  <Button
                    disabled={copying}
                    onClick={handleCopyLink}
                    type="button"
                    variant="secondary"
                  >
                    {copying ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Clipboard className="h-4 w-4" />
                    )}
                    Copiar link
                  </Button>
                  <a
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-white px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50"
                    href={publicBookingLink}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver página
                  </a>
                </div>
              </section>

              <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
                <h2 className="font-bold text-ink">Resumen</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {formatAvailabilitySummary(sortedAvailability)}
                </p>
              </section>
            </aside>
          </section>
        ) : null}

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
