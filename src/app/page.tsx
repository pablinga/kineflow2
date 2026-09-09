import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  CreditCard,
  HeartPulse,
  Instagram,
  Mail,
  MessageCircle,
  Plus,
  Smartphone,
  TrendingUp,
  UserPlus,
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

const spotlightBenefits = [
  {
    icon: CalendarClock,
    title: "Reservas online",
    text: "Tus pacientes reservan turnos solos desde un link, sin que vos tengas que coordinar por mensajes.",
  },
];

const listedBenefits = [
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
    <main className="min-h-screen bg-ocean-50 text-ink">
      <PublicNavbar />

      <section className="border-b border-ocean-100 bg-gradient-to-b from-white to-ocean-50 px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h1 className="mt-6 max-w-xl text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
              Gestioná tu consultorio sin perder tiempo en tareas
              administrativas
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Agenda, pacientes, evoluciones, cobros y recordatorios
              automáticos por WhatsApp. Todo en un solo lugar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              {showAuthLinks ? (
                <LinkButton
                  className="px-8 py-4 text-base sm:text-lg"
                  href="/registro"
                  prefetch={false}
                >
                  Probar gratis 3 meses
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
            {showAuthLinks ? (
              <p className="mt-3 text-sm font-semibold text-slate-500">
                Sin tarjeta de crédito
              </p>
            ) : null}
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[2.5rem] bg-gradient-to-br from-ocean-100/70 via-transparent to-emerald-100/60 blur-2xl"
            />

            <div className="relative rounded-lg bg-white p-4 shadow-card">
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
                    className="grid grid-cols-[4rem_1fr] gap-3 rounded-lg bg-ocean-50 p-3"
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

            <div
              className="absolute -left-6 -top-6 hidden w-64 items-center gap-3 rounded-lg bg-white p-3 shadow-card lg:flex"
              style={{
                animation: "kf-float-a 6s ease-in-out infinite",
                ["--kf-rotate" as string]: "-3deg",
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-600">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  Turno confirmado
                </p>
                <p className="text-xs text-slate-500">Hoy 09:00</p>
              </div>
              <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-600" />
            </div>

            <div
              className="absolute -right-6 top-1/3 hidden w-72 items-center gap-3 rounded-lg bg-white p-3 shadow-card lg:flex"
              style={{
                animation: "kf-float-b 7s ease-in-out infinite",
                ["--kf-rotate" as string]: "2deg",
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  Recordatorio enviado
                </p>
                <p className="text-xs text-slate-500">Por WhatsApp</p>
              </div>
              <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-600" />
            </div>

            <div
              className="absolute -bottom-6 -left-4 hidden w-60 items-center gap-3 rounded-lg bg-white p-3 shadow-card lg:flex"
              style={{
                animation: "kf-float-a 6.5s ease-in-out infinite",
                ["--kf-rotate" as string]: "2deg",
              }}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-600">
                <UserPlus className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  Nuevo paciente
                </p>
                <p className="text-xs text-slate-500">Agregado hoy</p>
              </div>
              <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Plus className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="beneficios">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-3xl font-bold text-ink">
            Diseñado para lo que importa.
          </h2>

          <div className="mt-8 grid gap-4">
            {spotlightBenefits.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="flex items-start gap-4 rounded-lg bg-ocean-50/60 p-6 shadow-card lg:p-7"
                  key={item.title}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white text-ocean-600">
                    <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {item.text}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 grid gap-x-8 gap-y-6 rounded-lg border border-ocean-100 bg-white p-6 sm:grid-cols-2 lg:p-8">
            {listedBenefits.map((item) => {
              const Icon = item.icon;

              return (
                <div className="flex items-start gap-3" key={item.title}>
                  <Icon
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-ocean-600"
                    strokeWidth={2.25}
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-ink">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {item.text}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section
        className="bg-ocean-50 px-4 py-14 sm:px-6 lg:px-8"
        id="whatsapp"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-ink">
              Menos ausencias. KineFlow recuerda los turnos por vos.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              KineFlow envía automáticamente la confirmación y el
              recordatorio del turno por WhatsApp para que vos no tengas que
              hacerlo.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1fr_0.85fr] lg:items-center">
            <div className="rounded-lg bg-white p-6 shadow-card lg:p-7">
              <div className="space-y-5">
                {[
                  {
                    icon: CheckCircle2,
                    title: "Menos ausencias",
                    text: "Tus pacientes no se olvidan.",
                    color: "emerald",
                  },
                  {
                    icon: Clock,
                    title: "Ahorrá tiempo",
                    text: "Todo se envía automáticamente.",
                    color: "ocean",
                  },
                  {
                    icon: UsersRound,
                    title: "Mejor organización",
                    text: "Aprovechá mejor tu agenda.",
                    color: "emerald",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  const isEmerald = item.color === "emerald";

                  return (
                    <div className="flex items-start gap-3" key={item.title}>
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isEmerald
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-ocean-50 text-ocean-600"
                        }`}
                      >
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="font-bold text-ink">{item.title}</p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-sm rounded-lg bg-white p-4 shadow-card">
              <div className="flex items-center gap-3 border-b border-ocean-100 pb-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-ink">KineFlow</p>
                  <p className="text-xs text-slate-500">Mensaje automático</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="rounded-lg rounded-tl-none bg-ocean-50 p-3 text-sm leading-6 text-ink">
                  ¡Hola Sofía! Tu turno con Lic. Martín Pérez quedó
                  confirmado para el miércoles a las 16:00.
                </div>
                <div className="ml-auto rounded-lg rounded-tr-none bg-emerald-50 p-3 text-sm leading-6 text-ink">
                  ¡Hola Sofía! Te recordamos tu turno con Lic. Martín Pérez
                  mañana a las 16:00. ¡Te esperamos!
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {[
                {
                  icon: CalendarDays,
                  title: "Turno confirmado",
                  text: "Mensaje enviado",
                  color: "ocean",
                },
                {
                  icon: Bell,
                  title: "Recordatorio (24 h)",
                  text: "Mensaje enviado",
                  color: "emerald",
                },
                {
                  icon: TrendingUp,
                  title: "Menos ausencias",
                  text: "Más pacientes, más tiempo para lo importante",
                  color: "ocean",
                },
              ].map((item, index) => {
                const Icon = item.icon;
                const isEmerald = item.color === "emerald";

                return (
                  <div key={item.title}>
                    <div className="flex items-center gap-3 rounded-lg bg-white p-3 shadow-card">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          isEmerald
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-ocean-50 text-ocean-600"
                        }`}
                      >
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {item.text}
                        </p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    </div>
                    {index < 2 ? (
                      <div className="flex justify-center py-1">
                        <ChevronDown
                          aria-hidden="true"
                          className="h-4 w-4 text-ocean-200"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-ocean-100 bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-bold text-ink">
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
                className="flex items-start gap-3 rounded-lg bg-white p-4 shadow-card"
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
          <h2 className="max-w-2xl text-3xl font-bold text-ink">
            Un plan para cada forma de trabajar.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featuredPlans.map((plan) => (
              <article
                className={`rounded-lg border bg-white p-5 shadow-card ${
                  plan.recommended ? "border-emerald-500" : "border-ocean-100"
                }`}
                key={plan.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">
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
            <h2 className="mt-4 text-3xl font-bold">
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
              Software para profesionales y clínicas de rehabilitación.
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
