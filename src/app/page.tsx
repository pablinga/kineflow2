import {
  ArrowRight,
  ChevronDown,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Instagram,
  Mail,
  MessageCircle,
  Search,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LegalLinks } from "@/components/layout/LegalLinks";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import {
  LANDING_DESCRIPTION,
  buildLandingJsonLd,
  serializeJsonLd,
} from "@/lib/landing-seo";
import { getSiteUrl } from "@/lib/site-url";
import { PublicProfileHeader } from "@/components/booking/PublicProfileHeader";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import type { PublicProfileView } from "@/lib/public-profile";
import {
  getVisiblePlansForMvp,
  plans as commercialPlans,
} from "@/lib/plans";
import {
  ACCESS_REQUEST_MAILTO,
  SIGNUPS_CLOSED_MESSAGE,
  arePublicAuthLinksVisible,
} from "@/lib/signups";
import {
  LANDING_CONTACT_EMAIL as contactEmail,
  LANDING_FAQ as faqs,
  LANDING_FEATURES as features,
  LANDING_INSTAGRAM_URL as instagramUrl,
  LANDING_TESTIMONIALS as testimonials,
  LANDING_WHATSAPP_BENEFITS as whatsappBenefits,
} from "@/lib/landing-content";

const howItWorks = [
  {
    icon: UserPlus,
    title: "Creá tu cuenta",
    text: "Te registrás en minutos, sin tarjeta de crédito.",
  },
  {
    icon: CalendarDays,
    title: "Cargá pacientes y turnos",
    text: "Importá tus pacientes desde Excel o CSV y sumá tu agenda a KineFlow.",
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


const directoryBenefits = [
  {
    icon: Stethoscope,
    title: "Tu perfil profesional",
    text: "Tratamientos, matrícula, dirección y si atendés a domicilio, en la misma página donde te reservan.",
  },
  {
    icon: ShieldCheck,
    title: "Obras sociales a la vista",
    text: "Las que cargás en KineFlow se muestran solas, junto con tus aclaraciones.",
  },
  {
    icon: CalendarClock,
    title: "Turnos libres en tiempo real",
    text: "Debajo del perfil, el paciente ve tus horarios disponibles y reserva sin escribirte.",
  },
];

// Perfil de ejemplo para la landing (mismo componente que la página pública).
const sampleProfile: PublicProfileView = {
  bio: "Kinesióloga con 10 años de experiencia en rehabilitación deportiva y traumatológica. Trabajo con ejercicio terapéutico y seguimiento sesión a sesión.",
  homeVisits: true,
  insuranceNotes: "",
  insuranceProviders: ["OSDE", "Swiss Medical", "IAPOS"],
  licenseNumber: "MP 0000",
  locality: { displayName: "Rosario", name: "Rosario", province: "Santa Fe" },
  localityId: "82084270",
  name: "Laura Gómez",
  publicAddress: "",
  treatments: ["deportiva", "traumatologia", "rpg"],
  type: "PERSONAL",
  workspaceId: "ejemplo",
};

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const landingJsonLd = serializeJsonLd(
  buildLandingJsonLd({
    contactEmail,
    description: LANDING_DESCRIPTION,
    faqs,
    instagramUrl,
    plans: commercialPlans,
    siteUrl: getSiteUrl(),
  }),
);

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
          <div className="order-1 min-w-0">
            <h1 className="mt-6 max-w-xl text-4xl font-extrabold leading-tight text-ink sm:text-5xl">
              El sistema para kinesiólogos: turnos, pacientes y cobros en un
              solo lugar
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Agenda con reservas online, evoluciones, cobros y recordatorios
              por WhatsApp. Para kinesiólogos independientes y consultorios.
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
            <LandingTestimonials testimonials={testimonials} variant="compact" />
          </div>

          <div className="relative order-2 mx-auto w-full max-w-xl lg:mx-0 lg:max-w-none">
            <div
              aria-hidden="true"
              className="absolute -inset-x-2 -inset-y-4 -z-10 rounded-[2.5rem] bg-gradient-to-br from-ocean-100/70 via-transparent to-emerald-100/60 blur-2xl sm:-inset-x-6 sm:-inset-y-8"
            />

            <div className="rounded-t-xl border-8 border-b-0 border-slate-800 bg-slate-800 shadow-card">
              <div className="relative aspect-[8/5] w-full overflow-hidden bg-white">
                <Image
                  alt="Captura del Dashboard de KineFlow, con turnos de hoy, pacientes activos y cobros pendientes"
                  className="object-cover object-top"
                  fill
                  priority
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  src="/images/landing/kineflow-screenshot-dashboard.png"
                />
              </div>
            </div>
            <div className="mx-auto h-3 w-full rounded-b-md bg-gradient-to-b from-slate-300 to-slate-400" />
            <div className="mx-auto h-1.5 w-1/4 rounded-b-lg bg-slate-400" />

            <div
              aria-hidden="true"
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
              aria-hidden="true"
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
              aria-hidden="true"
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
              <CheckCircle2 className="ml-auto h-5 w-5 shrink-0 text-emerald-600" />
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 lg:px-8" id="beneficios">
        <div className="mx-auto max-w-7xl">
          <h2 className="max-w-2xl text-3xl font-bold text-ink">
            Todo lo que necesitás, en un solo lugar.
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
                Cuando el paciente reserva por tu link y acepta recibirlos,
                KineFlow le envía automáticamente la confirmación y el
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

            <div className="mx-auto w-full max-w-xs lg:mx-0">
              <div className="rounded-[2rem] border-8 border-slate-800 bg-slate-800 shadow-card">
                <div className="flex justify-center py-1.5">
                  <span className="h-1.5 w-16 rounded-full bg-slate-600" />
                </div>
                <div className="overflow-hidden rounded-b-[1.5rem] bg-ocean-50">
                  <div className="flex items-center gap-3 border-b border-ocean-100 bg-white p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <MessageCircle className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink">KineFlow</p>
                      <p className="text-xs text-slate-500">
                        Mensajes automáticos
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 p-3 text-sm leading-6 text-ink">
                      ¡Hola Sofía! Tu turno con Lic. Martín Pérez quedó
                      confirmado para el miércoles a las 16:00.
                    </div>
                    <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-emerald-100 p-3 text-sm leading-6 text-ink">
                      ¡Hola Sofía! Te recordamos tu turno con Lic. Martín
                      Pérez mañana a las 16:00. ¡Te esperamos!
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-y border-ocean-100 bg-white px-4 py-14 sm:px-6 lg:px-8"
        id="buscador"
      >
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-ocean-700">
              <Search aria-hidden="true" className="h-4 w-4" />
              Incluido gratis
            </p>
            <h2 className="mt-2 text-3xl font-bold text-ink">
              Aparecé en el buscador de KineFlow
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-slate-600">
              Tu link de reservas se convierte en un perfil profesional que podés
              compartir: con tus tratamientos, obras sociales y turnos libres. Si
              querés, también lo vas a poder mostrar en el buscador de KineFlow.
            </p>

            <div className="mt-8 space-y-5">
              {directoryBenefits.map((item) => {
                const Icon = item.icon;

                return (
                  <div className="flex items-start gap-3" key={item.title}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold text-ink">{item.title}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{item.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {showAuthLinks ? (
              <LinkButton className="mt-8" href="/registro" prefetch={false}>
                Crear mi perfil gratis
                <ArrowRight className="h-4 w-4" />
              </LinkButton>
            ) : null}
          </div>

          <div>
            <span className="mb-3 inline-flex rounded-full bg-ocean-50 px-3 py-1 text-xs font-bold text-ocean-700">
              Perfil de ejemplo
            </span>
            <div aria-hidden="true" className="pointer-events-none select-none">
              <PublicProfileHeader headingLevel="h2" profile={sampleProfile} />
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

          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {commercialPlans
              .filter((plan) => plan.id !== "FREE")
              .map((plan) => {
                const Icon = plan.icon;
                const isConsultorio = plan.id === "CONSULTORIO";

                return (
                  <article
                    className="flex flex-col rounded-lg border border-ocean-100 bg-white p-6 shadow-card lg:p-7"
                    key={plan.id}
                  >
                    <span
                      className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
                        isConsultorio
                          ? "bg-ocean-50 text-ocean-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {isConsultorio
                        ? "Clínica / Consultorio"
                        : "Kinesiólogo independiente"}
                    </span>

                    <p className="mt-4 text-sm leading-6 text-slate-600">
                      {plan.audience}
                    </p>

                    <ul className="mt-5 space-y-2.5">
                      {plan.features.map((feature) => (
                        <li
                          className="flex items-start gap-2.5 text-sm text-ink"
                          key={feature}
                        >
                          <CheckCircle2
                            className={`mt-0.5 h-4 w-4 shrink-0 ${
                              isConsultorio
                                ? "text-ocean-600"
                                : "text-emerald-600"
                            }`}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {showAuthLinks ? (
                      <LinkButton
                        className="mt-6"
                        href={plan.href}
                        prefetch={false}
                        variant="primary"
                      >
                        {plan.cta}
                        <ArrowRight className="h-4 w-4" />
                      </LinkButton>
                    ) : (
                      <LinkButton
                        className="mt-6"
                        href={`mailto:${contactEmail}?subject=Quiero%20probar%20KineFlow`}
                        variant="secondary"
                      >
                        Contactanos
                      </LinkButton>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      Sin tarjeta de crédito.
                    </p>
                  </article>
                );
              })}
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

      <section
        className="border-y border-ocean-100 bg-white px-4 py-14 sm:px-6 lg:px-8"
        id="preguntas"
      >
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-ink">Preguntas frecuentes</h2>
          <div className="mt-8 divide-y divide-ocean-100 rounded-lg border border-ocean-100 bg-white">
            {faqs.map((faq) => (
              <details className="group px-5 py-4" key={faq.question}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-ink [&::-webkit-details-marker]:hidden">
                  <h3>{faq.question}</h3>
                  <ChevronDown
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 text-ocean-600 transition group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 leading-7 text-slate-600">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <LandingTestimonials testimonials={testimonials} />
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
      <script
        dangerouslySetInnerHTML={{ __html: landingJsonLd }}
        type="application/ld+json"
      />
    </main>
  );
}
