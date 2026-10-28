"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Search, Users, X } from "lucide-react";
import { AgendaAppointmentRow } from "@/components/turnos/AgendaAppointmentRow";
import { AgendaWeekStrip } from "@/components/turnos/AgendaWeekStrip";
import { PatientCard } from "@/components/patients/PatientCard";
import { LinkButton } from "@/components/ui/Button";
import { Logo } from "@/components/ui/Logo";
import { buildDemoSignupHref } from "@/lib/attribution";
import { getStoredAttribution, trackDemoView } from "@/lib/attribution-client";
import { buildDemoAppointments, buildDemoPatients, startOfDemoWeek } from "@/lib/demo-data";

type DemoTab = "agenda" | "pacientes";

const CTA_LABEL = "Probar 3 meses gratis";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function DemoClient() {
  // Las fechas de la demo dependen del reloj y la zona del navegador: se arman
  // después de montar para no tener diferencias con el HTML del servidor.
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [tab, setTab] = useState<DemoTab>("agenda");
  const [query, setQuery] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [signupHref, setSignupHref] = useState("/registro");

  useEffect(() => {
    const current = new Date();
    setNow(current);
    setSelectedDate(current);
    trackDemoView();
    setSignupHref(buildDemoSignupHref(window.location.search, getStoredAttribution()));
  }, []);

  const appointments = useMemo(() => (now ? buildDemoAppointments(now) : []), [now]);
  const patients = useMemo(
    () => (now ? buildDemoPatients(appointments, now) : []),
    [appointments, now],
  );
  const weekDays = useMemo(() => {
    const start = startOfDemoWeek(selectedDate ?? new Date());
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [selectedDate]);
  const daysWithAppointments = useMemo(
    () =>
      new Set(appointments.map((appointment) => new Date(appointment.scheduledAt).toDateString())),
    [appointments],
  );
  const dayAppointments = useMemo(
    () =>
      selectedDate
        ? appointments.filter(
            (appointment) =>
              new Date(appointment.scheduledAt).toDateString() === selectedDate.toDateString(),
          )
        : [],
    [appointments, selectedDate],
  );
  const filteredPatients = useMemo(() => {
    const needle = normalize(query.trim());

    return needle
      ? patients.filter(
          (patient) =>
            normalize(patient.name).includes(needle) || patient.document.includes(needle),
        )
      : patients;
  }, [patients, query]);

  const openNotice = () => setNoticeOpen(true);

  return (
    <main className="min-h-screen bg-ocean-50 text-ink">
      <header className="sticky top-0 z-30 border-b border-ocean-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4">
          <Logo />
          <LinkButton
            className="px-4 py-2 text-sm"
            data-testid="demo-cta"
            href={signupHref}
            prefetch={false}
          >
            {CTA_LABEL}
          </LinkButton>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-5">
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          Estás viendo una demo con pacientes y turnos ficticios. Podés recorrerla, pero
          nada se guarda.
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-full bg-white p-1 shadow-card" role="tablist">
          {(
            [
              ["agenda", "Agenda", CalendarDays],
              ["pacientes", "Pacientes", Users],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              aria-selected={tab === value}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-150 ease-out ${
                tab === value ? "bg-ocean-600 text-white" : "text-slate-600"
              }`}
              key={value}
              onClick={() => setTab(value)}
              role="tab"
              type="button"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {!now || !selectedDate ? (
          <div className="mt-5 h-96 animate-pulse rounded-lg bg-white shadow-card" />
        ) : tab === "agenda" ? (
          <section
            className="mt-5 overflow-hidden rounded-lg border border-ocean-100 bg-white shadow-card"
            data-testid="demo-agenda"
          >
            <div className="border-b border-ocean-100 px-4 pb-3 pt-3">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-600 first-letter:uppercase">
                  {selectedDate.toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "long",
                    weekday: "long",
                  })}
                </p>
                <button
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold text-ocean-700 transition-colors duration-150 ease-out active:bg-ocean-100"
                  onClick={() => setSelectedDate(new Date())}
                  type="button"
                >
                  Hoy
                </button>
              </div>
              <AgendaWeekStrip
                days={weekDays}
                daysWithAppointments={daysWithAppointments}
                onNextWeek={() => setSelectedDate((date) => addDays(date ?? now, 7))}
                onPreviousWeek={() => setSelectedDate((date) => addDays(date ?? now, -7))}
                onSelectDay={setSelectedDate}
                selectedDate={selectedDate}
              />
            </div>
            {dayAppointments.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                {daysWithAppointments.size > 0 &&
                startOfDemoWeek(selectedDate).getTime() !== startOfDemoWeek(now).getTime()
                  ? "En la demo hay turnos solo en la semana actual."
                  : "No hay turnos este día."}
              </p>
            ) : (
              <ul className="divide-y divide-ocean-50">
                {dayAppointments.map((appointment) => (
                  <AgendaAppointmentRow
                    appointment={appointment}
                    canSeeAmounts
                    clinicAppointment={false}
                    key={appointment.id}
                    onCharge={openNotice}
                    onMarkAttendance={openNotice}
                    onOpenActions={openNotice}
                    patientHref={null}
                    showOrigin={false}
                    showProfessional={false}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="mt-5" data-testid="demo-patients">
            <label className="flex h-12 items-center gap-2 rounded-lg border border-ocean-100 bg-white px-3 shadow-card">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="sr-only">Buscar paciente</span>
              <input
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre o DNI"
                type="search"
                value={query}
              />
            </label>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredPatients.map((patient) => (
                <PatientCard href={null} key={patient.id} patient={patient} />
              ))}
            </div>
            {filteredPatients.length === 0 ? (
              <p className="mt-6 text-center text-sm text-slate-500">
                No encontramos pacientes con esa búsqueda.
              </p>
            ) : null}
          </section>
        )}

        <section className="mt-8 rounded-lg bg-ocean-700 p-6 text-white shadow-card">
          <h2 className="text-xl font-bold">Cargá tus pacientes y empezá hoy</h2>
          <p className="mt-2 text-sm leading-6 text-ocean-50">
            Agenda, reservas online, evoluciones, cobros y recordatorios por WhatsApp. Tres
            meses gratis, sin tarjeta.
          </p>
          <LinkButton
            className="mt-5 px-6 py-3"
            variant="inverted"
            href={signupHref}
            prefetch={false}
          >
            {CTA_LABEL}
            <ArrowRight className="h-4 w-4" />
          </LinkButton>
        </section>
      </div>

      {noticeOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setNoticeOpen(false)}
        >
          <div
            aria-labelledby="demo-notice-title"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            data-testid="demo-notice"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold" id="demo-notice-title">
                Esto es una demo
              </h2>
              <button
                aria-label="Cerrar"
                className="-mr-2 -mt-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
                onClick={() => setNoticeOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Acá no se guardan cambios. Con tu cuenta marcás asistencia, cobrás y registrás
              evoluciones en un toque.
            </p>
            <LinkButton className="mt-5 w-full" href={signupHref} prefetch={false}>
              {CTA_LABEL}
            </LinkButton>
          </div>
        </div>
      ) : null}
    </main>
  );
}
