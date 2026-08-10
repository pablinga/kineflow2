"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  CalendarClock,
  Check,
  Clipboard,
  ExternalLink,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { DashboardLoading } from "@/components/layout/DashboardLoading";
import { DashboardSidebar } from "@/components/layout/DashboardSidebar";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { weekdayLabels } from "@/hooks/useClinicLinks";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

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

const emptyAvailability: AvailabilityInput = {
  weekday: 1,
  startsAt: "09:00",
  endsAt: "13:00",
};

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

export default function IndependentAvailabilityPage() {
  const { accountType, authError, loading, redirecting, user } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [availability, setAvailability] = useState<AvailabilityInput[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const canManage =
    accountType === "KINESIOLOGO" && activeWorkspace?.type === "PERSONAL";
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

  const loadAvailability = useCallback(async () => {
    if (!workspaceLoaded || !user || !canManage) {
      setLoaded(workspaceLoaded);
      return;
    }

    setLoaded(false);
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
      setLoaded(true);
    }
  }, [canManage, user, workspaceLoaded]);

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

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user || !canManage) {
      return;
    }

    setSaving(true);
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
      setSaving(false);
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

  if (loading || !workspaceLoaded || !loaded) {
    return <DashboardLoading />;
  }

  if (!canManage) {
    return (
      <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
        <DashboardSidebar />
        <PageContainer maxWidth="4xl">
          <Alert tone="warning" title="Reservas online no disponibles">
            Esta pantalla está disponible solo para kinesiólogos en su espacio
            personal.
          </Alert>
        </PageContainer>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 lg:grid lg:grid-cols-[18rem_1fr]">
      <DashboardSidebar />
      <PageContainer maxWidth="6xl">
        <PageHeader
          actions={
            <a
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-ocean-200 bg-white px-5 py-2.5 text-sm font-semibold text-ocean-800 transition hover:border-ocean-300 hover:bg-ocean-50"
              href={publicBookingLink}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              Ver página
            </a>
          }
          description="Definí los días y horarios que pueden aparecer como turnos libres en tu página pública de reservas."
          eyebrow="Reservas online"
          title="Disponibilidad para pacientes"
        />

        <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form
            className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6"
            onSubmit={handleSave}
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-xl font-bold text-ink">
                  Días y horarios
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Cada franja activa turnos disponibles de forma recurrente para
                  ese día.
                </p>
              </div>
              <button
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-ocean-200 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
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
                  No hay horarios configurados. Agregá una franja para empezar
                  a recibir reservas online.
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
                      className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400"
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
                      className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
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
                      className="mt-1 min-h-11 w-full rounded-lg border border-ocean-100 px-3 text-sm outline-none focus:border-ocean-400"
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
                    className="inline-flex min-h-11 items-center justify-center self-end rounded-lg border border-rose-100 px-3 text-rose-700 transition hover:bg-rose-50"
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
                disabled={saving}
                onClick={loadAvailability}
                type="button"
                variant="secondary"
              >
                <RefreshCw className="h-4 w-4" />
                Recargar
              </Button>
              <Button disabled={saving} type="submit">
                <Save className="h-4 w-4" />
                {saving ? "Guardando..." : "Guardar horarios"}
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

              <Button
                className="mt-4 w-full"
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
            </section>

            <section className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card">
              <h2 className="font-bold text-ink">Resumen</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {formatAvailabilitySummary(sortedAvailability)}
              </p>
            </section>
          </aside>
        </section>

        {error ? (
          <Alert className="mt-4" tone="error">
            {error}
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
