"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  UserRound,
} from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { isWhatsAppNotificationsEnabled } from "@/lib/whatsapp";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

type Workspace = {
  address: string | null;
  email: string | null;
  id: string;
  name: string;
  phone: string | null;
  type: "PERSONAL" | "CLINICA";
};

type Professional = {
  id: string;
  name: string;
};

type FreeSlot = {
  date: string;
  end: string;
  endTime: string;
  start: string;
  startTime: string;
};

type Confirmation = {
  date: string;
  durationMinutes: number;
  professionalName: string;
  time: string;
};

const durationMinutes = 45;

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatSlotDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
  });
}

function formatShortDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getMondayOfWeek(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  return toDateValue(addDays(date, diffToMonday));
}

function capitalizeFirst(text: string) {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export default function PublicBookingPage({ params }: PageProps) {
  const { workspaceId } = use(params);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [fromDate, setFromDate] = useState(() =>
    getMondayOfWeek(toDateValue(new Date())),
  );
  const [slots, setSlots] = useState<FreeSlot[]>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<FreeSlot | null>(null);
  const [form, setForm] = useState({
    company: "",
    documentNumber: "",
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    whatsappConsent: false,
  });
  const [loadingProfessionals, setLoadingProfessionals] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    async function loadProfessionals() {
      if (!workspaceId) {
        return;
      }

      setLoadingProfessionals(true);
      setError("");

      try {
        const response = await fetch(
          `/api/public/booking/${encodeURIComponent(workspaceId)}/professionals`,
        );
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "No pudimos cargar la agenda.");
        }

        const nextProfessionals = (result.professionals ?? []) as Professional[];

        setWorkspace(result.workspace as Workspace);
        setProfessionals(nextProfessionals);
        setProfessionalId((current) => current || nextProfessionals[0]?.id || "");
      } catch (loadError) {
        setError(getErrorMessage(loadError, "No pudimos cargar la agenda."));
      } finally {
        setLoadingProfessionals(false);
      }
    }

    loadProfessionals();
  }, [workspaceId]);

  const todayDate = toDateValue(new Date());
  const toDate = useMemo(
    () => toDateValue(addDays(new Date(`${fromDate}T12:00:00`), 4)),
    [fromDate],
  );
  const previousWeekEnd = toDateValue(
    addDays(new Date(`${fromDate}T12:00:00`), -1),
  );
  const canGoToPreviousWeek = previousWeekEnd >= todayDate;
  const weekRangeLabel = `${formatShortDate(fromDate)} al ${formatShortDate(toDate)}`;

  const loadAvailability = useCallback(async () => {
    if (!workspaceId || !professionalId) {
      setAvailabilityMessage("");
      setSlots([]);
      return;
    }

    setLoadingSlots(true);
    setAvailabilityMessage("");
    setSelectedSlot(null);
    setError("");

    try {
      const query = new URLSearchParams({
        durationMinutes: String(durationMinutes),
        from: fromDate,
        professionalId,
        to: toDate,
      });
      const response = await fetch(
        `/api/public/booking/${encodeURIComponent(
          workspaceId,
        )}/availability?${query.toString()}`,
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No pudimos cargar los horarios.");
      }

      setSlots((result.slots ?? []) as FreeSlot[]);
      setAvailabilityMessage(
        typeof result.message === "string" ? result.message : "",
      );
    } catch (loadError) {
      setError(getErrorMessage(loadError, "No pudimos cargar los horarios."));
      setAvailabilityMessage("");
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [fromDate, professionalId, toDate, workspaceId]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  const groupedSlots = useMemo(() => {
    return slots.reduce<Record<string, FreeSlot[]>>((groups, slot) => {
      groups[slot.date] = [...(groups[slot.date] ?? []), slot];
      return groups;
    }, {});
  }, [slots]);

  const selectedProfessional = professionals.find(
    (professional) => professional.id === professionalId,
  );
  const bookingTitle = loadingProfessionals
    ? "Cargando..."
    : workspace?.type === "PERSONAL" && professionals[0]?.name
      ? `Reservá un turno con ${professionals[0].name}`
      : workspace?.name ?? "KineFlow";

  const rescheduleContact = workspace?.phone || workspace?.email || "";

  function goToPreviousWeek() {
    if (!canGoToPreviousWeek) {
      return;
    }

    setFromDate((current) =>
      getMondayOfWeek(
        toDateValue(addDays(new Date(`${current}T12:00:00`), -7)),
      ),
    );
  }

  function goToNextWeek() {
    setFromDate((current) =>
      getMondayOfWeek(
        toDateValue(addDays(new Date(`${current}T12:00:00`), 7)),
      ),
    );
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedSlot) {
      setError("Elegí un horario para reservar.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/public/booking/${encodeURIComponent(workspaceId)}`,
        {
          body: JSON.stringify({
            company: form.company,
            documentNumber: form.documentNumber,
            durationMinutes,
            email: form.email,
            firstName: form.firstName,
            lastName: form.lastName,
            phone: form.phone,
            professionalId,
            scheduledAt: selectedSlot.start,
            whatsappConsent: form.whatsappConsent,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "No pudimos reservar el turno.");
      }

      setConfirmation(result.appointment as Confirmation);
    } catch (saveError) {
      setError(getErrorMessage(saveError, "No pudimos reservar el turno."));
      await loadAvailability();
    } finally {
      setSaving(false);
    }
  }

  if (confirmation) {
    return (
      <main className="min-h-screen bg-ocean-50 px-4 py-8">
        <section className="mx-auto w-full max-w-2xl rounded-lg border border-ocean-100 bg-white p-6 shadow-soft">
          <Logo showSlogan />
          <div className="mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-3xl font-bold text-ink">Turno reservado</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Tu reserva quedó registrada. No hace falta que hagas nada más.
          </p>
          <div className="mt-6 rounded-lg border border-ocean-100 bg-ocean-50 p-4 text-sm text-ocean-900">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Profesional
            </p>
            <p className="mt-1 font-bold">{confirmation.professionalName}</p>
            <p className="mt-2">{capitalizeFirst(confirmation.date)}</p>
            <p className="mt-1">
              {confirmation.time} · {confirmation.durationMinutes} minutos
            </p>
            {workspace?.address ? (
              <p className="mt-2">📍 {workspace.address}</p>
            ) : null}
            {rescheduleContact ? (
              <p className="mt-4 text-slate-700">
                Para reprogramar o cancelar, comunicate al {rescheduleContact}.
              </p>
            ) : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ocean-50 px-4 py-8">
      <section className="mx-auto w-full max-w-5xl">
        <div className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6">
          <Logo showSlogan />
          <div className="mt-8">
            <p className="text-sm font-semibold text-ocean-700">
              Reserva de turno
            </p>
            <h1 className="mt-1 text-3xl font-bold text-ink">
              {bookingTitle}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Elegí un horario disponible y completá tus datos para confirmar.
            </p>
          </div>

          {error ? (
            <Alert className="mt-6" tone="error">
              {error}
            </Alert>
          ) : null}

          {loadingProfessionals ? (
            <div className="mt-6 rounded-lg bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
              Cargando agenda...
            </div>
          ) : (
            <form className="mt-6 grid gap-6 lg:grid-cols-[1fr_24rem]" onSubmit={submitBooking}>
              <div className="space-y-6">
                {workspace?.type === "CLINICA" ? (
                  <section>
                    <div className="flex items-center gap-2 text-sm font-bold text-ink">
                      <UserRound className="h-4 w-4 text-ocean-600" />
                      Profesional
                    </div>
                    <select
                      className="mt-3 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) => setProfessionalId(event.target.value)}
                      value={professionalId}
                    >
                      {professionals.map((professional) => (
                        <option key={professional.id} value={professional.id}>
                          {professional.name}
                        </option>
                      ))}
                    </select>
                    {selectedProfessional ? (
                      <p className="mt-2 text-sm font-semibold text-ocean-800">
                        Profesional seleccionado: {selectedProfessional.name}
                      </p>
                    ) : null}
                  </section>
                ) : null}

                <section>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-bold text-ink">
                        <CalendarDays className="h-4 w-4 text-ocean-600" />
                        Día y horario
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        Mostramos únicamente franjas libres.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <p className="text-sm font-bold text-ink">
                        {weekRangeLabel}
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-100 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canGoToPreviousWeek}
                          onClick={goToPreviousWeek}
                          type="button"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Anterior
                        </button>
                        <button
                          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-ocean-100 px-3 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                          onClick={goToNextWeek}
                          type="button"
                        >
                          Siguiente
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {loadingSlots ? (
                    <div className="mt-4 rounded-lg bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
                      Buscando horarios...
                    </div>
                  ) : slots.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-dashed border-ocean-200 bg-ocean-50 p-5 text-sm font-semibold text-ocean-800">
                      {availabilityMessage || "No hay horarios disponibles en este rango."}
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-4">
                      {Object.entries(groupedSlots).map(([date, daySlots]) => (
                        <div key={date} className="rounded-lg border border-ocean-100 p-4">
                          <p className="text-sm font-bold capitalize text-ink">
                            {formatSlotDate(date)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {daySlots.map((slot) => {
                              const selected = selectedSlot?.start === slot.start;

                              return (
                                <button
                                  className={
                                    selected
                                      ? "inline-flex min-h-10 items-center gap-2 rounded-lg bg-ocean-600 px-4 text-sm font-semibold text-white"
                                      : "inline-flex min-h-10 items-center gap-2 rounded-lg border border-ocean-100 px-4 text-sm font-semibold text-ocean-800 transition hover:bg-ocean-50"
                                  }
                                  key={slot.start}
                                  onClick={() => setSelectedSlot(slot)}
                                  type="button"
                                >
                                  <Clock className="h-4 w-4" />
                                  {slot.startTime}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <aside className="rounded-lg border border-ocean-100 bg-ocean-50 p-4">
                <h2 className="text-lg font-bold text-ink">Tus datos</h2>
                {selectedSlot ? (
                  <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-ocean-900">
                    {formatSlotDate(selectedSlot.date)} a las {selectedSlot.startTime}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Primero elegí un horario disponible.
                  </p>
                )}

                <div className="mt-4 hidden">
                  <label htmlFor="company">Empresa</label>
                  <input
                    autoComplete="off"
                    id="company"
                    name="company"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        company: event.target.value,
                      }))
                    }
                    tabIndex={-1}
                    value={form.company}
                  />
                </div>

                <div className="mt-4 grid gap-3">
                  <input
                    className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        documentNumber: event.target.value,
                      }))
                    }
                    placeholder="DNI"
                    required
                    value={form.documentNumber}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <input
                      className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          firstName: event.target.value,
                        }))
                      }
                      placeholder="Nombre"
                      required
                      value={form.firstName}
                    />
                    <input
                      className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          lastName: event.target.value,
                        }))
                      }
                      placeholder="Apellido"
                      required
                      value={form.lastName}
                    />
                  </div>
                  <input
                    className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="Email"
                    required
                    type="email"
                    value={form.email}
                  />
                  <input
                    className="min-h-11 rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="Teléfono"
                    required
                    value={form.phone}
                  />
                  {isWhatsAppNotificationsEnabled() ? (
                    <label className="flex items-start gap-3 rounded-lg border border-ocean-100 bg-white p-3 text-sm font-semibold leading-5 text-slate-700">
                      <input
                        checked={form.whatsappConsent}
                        className="mt-1 h-4 w-4 rounded border-ocean-200 text-ocean-600 focus:ring-ocean-400"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            whatsappConsent: event.target.checked,
                          }))
                        }
                        type="checkbox"
                      />
                      <span>
                        Quiero recibir la confirmacion y recordatorios de mi turno
                        por WhatsApp
                      </span>
                    </label>
                  ) : null}
                </div>

                <Button
                  className="mt-5 w-full"
                  disabled={
                    saving ||
                    !selectedSlot ||
                    !selectedProfessional ||
                    professionals.length === 0
                  }
                  type="submit"
                >
                  <CheckCircle className="h-4 w-4" />
                  {saving ? "Reservando..." : "Confirmar turno"}
                </Button>
              </aside>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
