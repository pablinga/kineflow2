import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  HeartPulse,
  Instagram,
  Mail,
  MessageCircle,
  TrendingUp,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { LinkButton } from "@/components/ui/Button";
import { getVisiblePlansForMvp } from "@/lib/plans";
import {
  ACCESS_REQUEST_MAILTO,
  SIGNUPS_CLOSED_MESSAGE,
  arePublicAuthLinksVisible,
} from "@/lib/signups";

const features = [
  {
    icon: CalendarClock,
    title: "Reservas online",
    text: "Tus pacientes reservan turnos solos desde un link, sin que vos tengas que coordinar por mensajes.",
  },
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
];

const whatsappBenefits = [
  {
    icon: CheckCircle2,
    title: "Menos ausencias",
    text: "Tus pacientes no se olvidan del turno.",
  },
  {
    icon: Clock,
    title: "Ahorrá tiempo",
    text: "La confirmación y el recordatorio se envían solos.",
  },
  {
    icon: MessageCircle,
    title: "Sin coordinar a mano",
    text: "Nada de escribir uno por uno para confirmar.",
  },
];

const howItWorks = [
  {
    icon: UserPlus,
    title: "Creá tu cuenta",
    text: "Te registrás en minutos, sin tarjeta de crédito.",
  },
  {
    icon: CalendarDays,
    title: "Cargá pacientes y turnos",
    text: "Sumá tu agenda y tus fichas de pacientes a KineFlow.",
  },
  {
    icon: TrendingUp,
    title: "Cobrá y hacé seguimiento",
    text: "Controlá cobros y evolución sin planillas sueltas.",
  },
];

const productScreenshots = [
  {
    src: "/images/landing/kineflow-screenshot-dashboard.png",
    alt: "Captura de pantalla del Dashboard de KineFlow, con turnos de hoy, pacientes activos y cobros pendientes",
    title: "Dashboard",
    text: "Todo lo importante del día, de un vistazo.",
  },
  {
    src: "/images/landing/kineflow-screenshot-agenda.png",
    alt: "Captura de pantalla de la Agenda de KineFlow, con los turnos del mes organizados por día",
    title: "Agenda",
    text: "Vista por mes, semana o día, siempre clara.",
  },
  {
    src: "/images/landing/kineflow-screenshot-ingresos.png",
    alt: "Captura de pantalla de Ingresos de KineFlow, con el total cobrado y el detalle de sesiones",
    title: "Ingresos",
    text: "Cobros por sesión y pendientes, siempre a la vista.",
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
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="order-1">
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

          <div className="order-2 mx-auto w-full max-w-2xl lg:mx-0 lg:max-w-none">
            <Image
              alt="Panel de KineFlow en una computadora, mostrando la agenda del día, turnos confirmados y recordatorios enviados por WhatsApp"
              className="h-auto w-full rounded-lg shadow-card"
              height={1024}
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              src="/images/landing/kineflow-hero.jpeg"
              width={1536}
            />
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="beneficios">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-3xl font-bold text-ink">
            Todo lo que necesitás para tu consultorio.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="flex items-start gap-4 rounded-lg border border-ocean-100 bg-white p-6 shadow-card"
                  key={item.title}
                >
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-600">
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
        </div>
      </section>

      <section
        className="bg-ocean-50 px-4 py-14 sm:px-6 lg:px-8"
        id="whatsapp"
      >
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold text-ink">
                Menos ausencias. KineFlow recuerda los turnos por vos.
              </h2>
              <p className="mt-4 max-w-lg leading-7 text-slate-600">
                KineFlow envía automáticamente la confirmación y el
                recordatorio del turno por WhatsApp para que vos no tengas
                que hacerlo.
              </p>

              <div className="mt-8 space-y-5">
                {whatsappBenefits.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div className="flex items-start gap-3" key={item.title}>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
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

            <div className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-none">
              <Image
                alt="Recordatorio de turno enviado automáticamente por WhatsApp desde KineFlow a un paciente"
                className="h-auto w-full rounded-lg shadow-card"
                height={1024}
                sizes="(min-width: 1024px) 45vw, 100vw"
                src="/images/landing/kineflow-whatsapp.jpeg"
                width={1536}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="para-quien">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-ink">
              Pensado para kinesiólogos independientes y clínicas o
              consultorios.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              La misma herramienta, adaptada a tus necesidades.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-4xl">
            <Image
              alt="Comparación de planes de KineFlow para kinesiólogos independientes y para clínicas o consultorios"
              className="h-auto w-full rounded-lg shadow-card"
              height={578}
              sizes="(min-width: 1024px) 60vw, 100vw"
              src="/images/landing/kineflow-independiente-clinica.jpeg"
              width={1536}
            />
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {showAuthLinks ? (
              <LinkButton
                className="px-8 py-4 text-base"
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
            {showAuthLinks ? (
              <p className="text-sm font-semibold text-slate-500">
                Sin tarjeta de crédito
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="border-y border-ocean-100 bg-white px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-ink">
              Así se ve KineFlow por dentro.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Sin vueltas: agenda, pacientes y cobros, siempre a mano.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {productScreenshots.map((item) => (
              <figure key={item.title}>
                <Image
                  alt={item.alt}
                  className="h-auto w-full rounded-lg border border-ocean-100 shadow-card"
                  height={1600}
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  src={item.src}
                  width={2560}
                />
                <figcaption className="mt-3">
                  <p className="font-bold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{item.text}</p>
                </figcaption>
              </figure>
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

      <section
        className="bg-ocean-50 px-4 py-14 sm:px-6 lg:px-8"
        id="como-funciona"
      >
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-3xl font-bold text-ink">
            Cómo funciona.
          </h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {howItWorks.map((item, index) => {
              const Icon = item.icon;

              return (
                <article
                  className="rounded-lg border border-ocean-100 bg-white p-6 shadow-card"
                  key={item.title}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-600">
                      <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={2.25} />
                    </span>
                    <span className="text-sm font-bold text-slate-400">
                      Paso {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-ink">
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

      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-lg bg-gradient-to-br from-ocean-50 via-white to-emerald-50 p-8 text-center shadow-soft sm:p-12">
          <h2 className="text-3xl font-bold text-ink">
            Empezá a usar KineFlow hoy
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Creá tu cuenta y empezá a ordenar pacientes, turnos, sesiones,
            evolución y cobros desde una interfaz preparada para celular.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            {showAuthLinks ? (
              <LinkButton
                className="px-8 py-4 text-base"
                href="/registro"
                prefetch={false}
              >
                Crear cuenta gratis
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
            {showAuthLinks ? (
              <p className="text-sm font-semibold text-slate-500">
                Sin tarjeta de crédito
              </p>
            ) : null}
          </div>
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
