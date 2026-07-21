import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  HeartPulse,
  Instagram,
  Mail,
  Smartphone,
  UsersRound,
} from "lucide-react";
import { redirect } from "next/navigation";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { LinkButton } from "@/components/ui/Button";
import { KineFlowIcon } from "@/components/ui/Logo";
import { getVisiblePlansForMvp } from "@/lib/plans";
import {
  ACCESS_REQUEST_MAILTO,
  SIGNUPS_CLOSED_MESSAGE,
  arePublicAuthLinksVisible,
} from "@/lib/signups";

const benefits = [
  {
    icon: CalendarDays,
    title: "Agenda simple",
    text: "Turnos claros para organizar el día desde el celular.",
  },
  {
    icon: UsersRound,
    title: "Pacientes ordenados",
    text: "Datos, historial y tratamientos en una ficha fácil de leer.",
  },
  {
    icon: HeartPulse,
    title: "Evolución por tratamiento",
    text: "Notas y seguimiento del progreso en cada sesión.",
  },
  {
    icon: ClipboardList,
    title: "Registro de sesiones",
    text: "Asistencia, observaciones y continuidad sin planillas sueltas.",
  },
  {
    icon: CreditCard,
    title: "Control de cobros",
    text: "Cobros por sesión y pendientes siempre visibles.",
  },
  {
    icon: Smartphone,
    title: "Desde el celular",
    text: "Pensado para usar entre turnos, sin sobrecarga administrativa.",
  },
];

const instagramUrl = "https://www.instagram.com/kineflow.ar/";
const contactEmail = "contacto@kineflow.ar";

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const preapprovalId = params?.preapproval_id;

  if (typeof preapprovalId === "string" && preapprovalId) {
    redirect(`/suscripcion-exitosa?preapproval_id=${preapprovalId}`);
  }

  const featuredPlans = getVisiblePlansForMvp();
  const showAuthLinks = arePublicAuthLinksVisible();

  return (
    <main className="min-h-screen bg-white text-ink">
      <PublicNavbar />

      <section className="overflow-hidden border-b border-ocean-100 bg-gradient-to-b from-white to-[#F5F7FA] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-3 rounded-full border border-ocean-100 bg-white px-3 py-2 text-sm font-bold text-ocean-600 shadow-card">
              <KineFlowIcon className="h-7 w-7" />
              {"Gesti\u00f3n simple para kinesi\u00f3logos"}
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
              Gestiona tus pacientes, turnos y sesiones en un solo lugar
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              KineFlow está pensado para kinesiólogos independientes que
              necesitan ordenar su día a día de forma simple, rápida y desde
              cualquier dispositivo.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {showAuthLinks ? (
                <LinkButton href="/registro" prefetch={false}>
                  Comenzar ahora
                  <ArrowRight className="h-4 w-4" />
                </LinkButton>
              ) : (
                <LinkButton
                  href={`mailto:${contactEmail}?subject=Quiero%20probar%20KineFlow`}
                  variant="secondary"
                >
                  Contactanos
                  <ArrowRight className="h-4 w-4" />
                </LinkButton>
              )}
              <LinkButton href="#planes" variant="secondary">
                Ver plan
              </LinkButton>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-lg border border-ocean-100 bg-white p-4 shadow-card">
              <div className="flex items-center justify-between border-b border-ocean-100 pb-4">
                <div>
                  <p className="text-sm font-bold text-ocean-600">
                    Agenda de hoy
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-ink">
                    8 turnos
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  Plan activo
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  ["09:00", "Martina Suárez", "Rehabilitación de rodilla"],
                  ["10:30", "Laura Méndez", "Control cervical"],
                  ["12:00", "Diego Ramos", "Sesión de fuerza"],
                ].map(([time, patient, reason]) => (
                  <div
                    className="grid grid-cols-[4rem_1fr] gap-3 rounded-lg border border-ocean-100 bg-[#F5F7FA] p-3"
                    key={`${time}-${patient}`}
                  >
                    <p className="font-extrabold text-ocean-600">{time}</p>
                    <div>
                      <p className="font-bold text-ink">{patient}</p>
                      <p className="mt-1 text-sm text-slate-500">{reason}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  ["Pacientes", "35"],
                  ["Sesiones", "42"],
                  ["Cobros", "$ 84k"],
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-ocean-50 p-3" key={label}>
                    <p className="text-xs font-bold uppercase text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-xl font-extrabold text-ocean-700">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="beneficios">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold text-ocean-600">Beneficios</p>
            <h2 className="mt-3 text-3xl font-extrabold text-ink">
              Diseñado para lo que importa.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="rounded-lg border border-ocean-100 bg-white p-5 shadow-card"
                  key={item.title}
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-50 text-ocean-600">
                    <Icon
                      aria-hidden="true"
                      className="h-5 w-5"
                      strokeWidth={2.25}
                      vectorEffect="non-scaling-stroke"
                    />
                  </span>
                  <h3 className="mt-4 font-extrabold text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {item.text}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-ocean-100 bg-[#F5F7FA] px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-bold text-ocean-600">Flujo simple</p>
            <h2 className="mt-3 text-3xl font-extrabold text-ink">
              Abrir, registrar, seguir.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              La experiencia prioriza acciones frecuentes: ver agenda, abrir
              una ficha, registrar una sesión, cargar evolución y controlar
              cobros.
            </p>
          </div>
          <div className="grid gap-3">
            {[
              "Usalo desde el celular entre turnos.",
              "Cada paciente mantiene su historial y evolución ordenados.",
              "Los cobros por sesión quedan conectados al trabajo diario.",
            ].map((text) => (
              <div
                className="flex items-start gap-3 rounded-lg border border-ocean-100 bg-white p-4 shadow-card"
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
            <p className="text-sm font-bold text-ocean-600">Plan</p>
            <h2 className="mt-3 text-3xl font-extrabold text-ink">
              Un plan para tu práctica independiente.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {featuredPlans.map((plan) => (
              <article
                className={`rounded-lg border bg-white p-5 shadow-card ${
                  plan.recommended ? "border-ocean-500" : "border-ocean-100"
                }`}
                key={plan.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-extrabold text-ink">
                      {plan.name}
                    </h3>
                    <p className="mt-2 text-2xl font-extrabold text-ocean-700">
                      {plan.price}
                    </p>
                  </div>
                  {plan.recommended ? (
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                      Recomendado
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {plan.audience}
                </p>
                {showAuthLinks ? (
                  <LinkButton
                    className="mt-5 w-full"
                    href={plan.href}
                    prefetch={false}
                    variant={plan.recommended ? "primary" : "secondary"}
                  >
                    {plan.cta}
                  </LinkButton>
                ) : (
                  <LinkButton
                    className="mt-5 w-full"
                    href={`mailto:${contactEmail}?subject=Quiero%20probar%20KineFlow`}
                    variant="secondary"
                  >
                    Contactanos
                  </LinkButton>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="como-funciona">
        <div className="mx-auto flex max-w-5xl flex-col justify-between gap-6 rounded-lg bg-ocean-900 p-6 text-white shadow-soft sm:p-8 md:flex-row md:items-center">
          <div>
            <KineFlowIcon className="h-12 w-12" />
            <h2 className="mt-4 text-3xl font-extrabold">
              Probá KineFlow gratis
            </h2>
            <p className="mt-3 max-w-2xl text-ocean-100">
              Creá tu cuenta y empezá a ordenar pacientes, turnos, sesiones,
              evolución y cobros desde una interfaz preparada para celular.
            </p>
          </div>
          {showAuthLinks ? (
            <LinkButton
              className="shrink-0 px-6"
              href="/registro"
              prefetch={false}
              variant="inverted"
            >
              Crear cuenta gratis
            </LinkButton>
          ) : (
            <LinkButton
              href={`mailto:${contactEmail}?subject=Quiero%20probar%20KineFlow`}
              variant="inverted"
              className="shrink-0 px-6"
            >
              Contactanos
            </LinkButton>
          )}
        </div>
      </section>

      <section
        className="border-t border-ocean-100 px-4 py-7 sm:px-6 lg:px-8"
        id="contacto"
      >
        {showAuthLinks ? null : (
          <div className="mx-auto mb-7 flex max-w-7xl flex-col gap-4 rounded-lg border border-ocean-100 bg-ocean-50 px-5 py-4 text-ocean-900 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-3xl whitespace-pre-line text-sm font-semibold leading-6">
              {SIGNUPS_CLOSED_MESSAGE}
            </p>
            <LinkButton className="shrink-0" href={ACCESS_REQUEST_MAILTO}>
              Solicitar acceso
            </LinkButton>
          </div>
        )}
        <div className="mx-auto grid max-w-7xl gap-6 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="font-extrabold text-ink">KineFlow</p>
            <p className="mt-2 text-slate-500">
              Gestión simple para kinesiólogos.
            </p>
            <p className="mt-4 text-xs text-slate-500">
              © 2026 KineFlow. Todos los derechos reservados.
            </p>
          </div>
          <div>
            <p className="font-bold text-ink">Legal</p>
            <LegalLinks className="mt-3 flex-col text-sm" />
          </div>
          <div>
            <p className="font-bold text-ink">Contacto</p>
            <a
              className="mt-3 inline-flex items-center gap-2 hover:text-ocean-700"
              href={`mailto:${contactEmail}`}
            >
              <Mail className="h-4 w-4" />
              {contactEmail}
            </a>
            <a
              className="mt-2 inline-flex items-center gap-2 hover:text-ocean-700"
              href={instagramUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Instagram className="h-4 w-4" />
              @kineflow.ar
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
