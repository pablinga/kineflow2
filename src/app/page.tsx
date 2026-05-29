import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Instagram,
  MessageSquare,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { LinkButton } from "@/components/ui/Button";
import { plans } from "@/lib/plans";

const highlights = [
  {
    icon: UsersRound,
    title: "Pacientes",
    text: "Datos, historial y evolucion en una ficha simple.",
  },
  {
    icon: CalendarDays,
    title: "Agenda",
    text: "Turnos propios y de consultorio en una vista clara.",
  },
  {
    icon: ClipboardList,
    title: "Sesiones",
    text: "Asistencia, evolucion y cobros conectados al tratamiento.",
  },
];

const instagramUrl = "https://www.instagram.com/kineflow.app/";
const contactEmail = "contacto@kineflow.app";

export default function Home() {
  const featuredPlans = plans.filter((plan) =>
    ["FREE", "INDEPENDIENTE", "CONSULTORIO_2"].includes(plan.id),
  );

  return (
    <main className="min-h-screen bg-white text-ink">
      <PublicNavbar />

      <section className="border-b border-ocean-100 px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-ocean-700">
              KineFlow para profesionales y consultorios
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
              Gestiona pacientes, turnos y evoluciones sin ruido.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              Una app mobile-first para ordenar el dia de trabajo entre sesiones:
              agenda, fichas clinicas, asistencia y cobros en un mismo lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton href="/registro">
                Empezar gratis
                <ArrowRight className="h-4 w-4" />
              </LinkButton>
              <LinkButton href="/login" variant="secondary">
                Ingresar
              </LinkButton>
            </div>
          </div>

          <div className="rounded-lg border border-ocean-100 bg-ocean-50 p-3">
            <div className="rounded-lg border border-ocean-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-ocean-100 pb-4">
                <div>
                  <p className="text-sm font-semibold text-ocean-700">
                    Agenda de hoy
                  </p>
                  <p className="mt-1 text-2xl font-bold text-ink">8 turnos</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  Plan activo
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["09:00", "Martina Suarez", "Rehabilitacion de rodilla"],
                  ["10:30", "Laura Mendez", "Control cervical"],
                  ["12:00", "Diego Ramos", "Sesion de fuerza"],
                ].map(([time, patient, reason]) => (
                  <div
                    className="grid grid-cols-[4rem_1fr] gap-3 rounded-lg border border-ocean-100 p-3"
                    key={`${time}-${patient}`}
                  >
                    <p className="font-bold text-ocean-800">{time}</p>
                    <div>
                      <p className="font-semibold text-ink">{patient}</p>
                      <p className="mt-1 text-sm text-slate-500">{reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="beneficios">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 md:grid-cols-3">
            {highlights.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="rounded-lg border border-ocean-100 bg-white p-5"
                  key={item.title}
                >
                  <Icon className="h-5 w-5 text-ocean-700" />
                  <h2 className="mt-4 font-bold text-ink">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.text}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-ocean-100 bg-ocean-50 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-ocean-700">
              Flujo simple
            </p>
            <h2 className="mt-3 text-3xl font-bold text-ink">
              Lo que se usa todos los dias, primero.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              KineFlow prioriza las acciones frecuentes: ver agenda, abrir una
              ficha, registrar asistencia, cargar evolucion y seguir cobros.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              "Abrir el panel desde el celular.",
              "Ver turnos del dia y pacientes activos.",
              "Registrar la sesion sin perder contexto.",
            ].map((text) => (
              <div
                className="flex items-start gap-3 rounded-lg border border-ocean-100 bg-white p-4"
                key={text}
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <p className="text-sm leading-6 text-slate-700">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="planes">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-ocean-700">Planes</p>
            <h2 className="mt-3 text-3xl font-bold text-ink">
              Empeza chico. Escala cuando lo necesites.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {featuredPlans.map((plan) => (
              <article
                className={`rounded-lg border bg-white p-5 ${
                  plan.recommended
                    ? "border-ocean-500 shadow-sm"
                    : "border-ocean-100"
                }`}
                key={plan.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
                    <p className="mt-2 text-2xl font-bold text-ocean-800">
                      {plan.price}
                    </p>
                  </div>
                  {plan.recommended ? (
                    <span className="rounded-full bg-ocean-50 px-3 py-1 text-xs font-bold text-ocean-800">
                      Recomendado
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {plan.limit}
                </p>
                <LinkButton
                  className="mt-5 w-full"
                  href={plan.href}
                  variant={plan.recommended ? "primary" : "secondary"}
                >
                  {plan.cta}
                </LinkButton>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="como-funciona">
        <div className="mx-auto flex max-w-5xl flex-col justify-between gap-6 rounded-lg border border-ocean-100 bg-ocean-700 p-6 text-white sm:p-8 md:flex-row md:items-center">
          <div>
            <ShieldCheck className="h-6 w-6 text-ocean-100" />
            <h2 className="mt-4 text-3xl font-bold">Proba KineFlow gratis</h2>
            <p className="mt-3 max-w-2xl text-ocean-100">
              Crea tu cuenta y empeza a ordenar el trabajo clinico con una
              interfaz clara y preparada para celular.
            </p>
          </div>
          <LinkButton
            className="shrink-0 bg-white text-ocean-800 hover:bg-ocean-50"
            href="/registro"
          >
            Crear cuenta
          </LinkButton>
        </div>
      </section>

      <section className="border-t border-ocean-100 px-4 py-10 sm:px-6 lg:px-8" id="contacto">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="font-bold text-ink">KineFlow</p>
            <p className="mt-1 text-sm text-slate-500">
              Gestion clinica simple para kinesiologos.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm font-semibold text-slate-600">
            <a
              className="inline-flex items-center gap-2 hover:text-ocean-700"
              href={instagramUrl}
              rel="noreferrer"
              target="_blank"
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </a>
            <a
              className="inline-flex items-center gap-2 hover:text-ocean-700"
              href={`mailto:${contactEmail}?subject=Contacto%20KineFlow`}
            >
              <MessageSquare className="h-4 w-4" />
              Contacto
            </a>
            <a href="/login">Ingresar</a>
            <a href="/registro">Registrarse</a>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl text-xs text-slate-400">
          Ambiente QA / Preview
        </div>
      </section>
    </main>
  );
}
