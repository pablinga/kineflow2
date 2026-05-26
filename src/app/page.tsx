import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  FileHeart,
  LineChart,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { LinkButton } from "@/components/ui/Button";

const benefits = [
  {
    icon: ClipboardList,
    title: "Historias clínicas ordenadas",
    text: "Centralizá datos, diagnósticos, objetivos y notas de evolución en un solo lugar.",
  },
  {
    icon: CalendarCheck,
    title: "Sesiones bajo control",
    text: "Visualizá turnos, asistencia y continuidad de tratamiento sin planillas sueltas.",
  },
  {
    icon: LineChart,
    title: "Evolución visible",
    text: "Seguimiento claro para medir progreso y tomar mejores decisiones clínicas.",
  },
];

const steps = [
  "Registrá tu consultorio y configurá tu perfil profesional.",
  "Cargá pacientes, antecedentes y objetivos terapéuticos.",
  "Seguimiento sesión por sesión con métricas y notas simples.",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <PublicNavbar />
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,#d9f1ff,transparent_34%),linear-gradient(180deg,#ffffff_0%,#f5fbff_100%)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:px-8">
          <div className="flex flex-col justify-center">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-ocean-200 bg-white px-4 py-2 text-sm font-semibold text-ocean-800 shadow-sm">
              <Sparkles className="h-4 w-4" />
              Gestión clínica moderna para kinesiólogos
            </div>
            <h1 className="max-w-3xl text-4xl font-bold tracking-normal text-ink sm:text-5xl lg:text-6xl">
              KineFlow
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              Organizá pacientes, sesiones y evolución clínica con una
              experiencia simple, profesional y pensada para el ritmo real del
              consultorio.
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
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-4">
              {[
                ["+120", "sesiones/mes"],
                ["24h", "acceso seguro"],
                ["100%", "responsive"],
              ].map(([value, label]) => (
                <div key={label}>
                  <p className="text-2xl font-bold text-ocean-700">{value}</p>
                  <p className="text-sm text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-full rounded-lg border border-ocean-100 bg-white p-4 shadow-soft">
              <div className="flex items-center justify-between border-b border-ocean-100 pb-4">
                <div>
                  <p className="text-sm font-semibold text-ocean-700">
                    Panel clínico
                  </p>
                  <p className="text-xl font-bold text-ink">Hoy en KineFlow</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                  Activo
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Pacientes activos", "42"],
                  ["Turnos de hoy", "8"],
                  ["Evoluciones nuevas", "16"],
                  ["Altas del mes", "5"],
                ].map(([label, value]) => (
                  <div
                    className="rounded-lg border border-ocean-100 bg-ocean-50 p-4"
                    key={label}
                  >
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-2 text-3xl font-bold text-ocean-800">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-ocean-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ocean-600 text-white">
                    <FileHeart className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-ink">Próxima sesión</p>
                    <p className="text-sm text-slate-500">
                      10:30 · Laura Méndez · Rehabilitación cervical
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8" id="beneficios">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-ocean-600">
              Beneficios
            </p>
            <h2 className="mt-3 text-3xl font-bold text-ink">
              Todo lo importante del tratamiento, siempre a mano.
            </h2>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <article
                  className="rounded-lg border border-ocean-100 bg-white p-6 shadow-sm"
                  key={benefit.title}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-ocean-50 text-ocean-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-ink">
                    {benefit.title}
                  </h3>
                  <p className="mt-3 leading-7 text-slate-600">{benefit.text}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-ocean-50 px-4 py-16 sm:px-6 lg:px-8" id="como-funciona">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-ocean-600">
              Cómo funciona
            </p>
            <h2 className="mt-3 text-3xl font-bold text-ink">
              Menos administración, más foco clínico.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              KineFlow está pensado para acompañar el flujo completo de atención:
              desde la primera consulta hasta el alta.
            </p>
          </div>
          <div className="grid gap-4">
            {steps.map((step, index) => (
              <div
                className="flex gap-4 rounded-lg border border-ocean-100 bg-white p-5"
                key={step}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-600 font-bold text-white">
                  {index + 1}
                </span>
                <p className="pt-2 font-medium leading-7 text-slate-700">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-6 rounded-lg bg-ocean-700 p-8 text-white shadow-soft md:flex-row md:items-center">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-white/15">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="text-3xl font-bold">Empezá a ordenar tu consultorio</h2>
            <p className="mt-3 max-w-2xl text-ocean-100">
              Creá tu cuenta y probá una experiencia de gestión clara,
              responsive y preparada para crecer con tu práctica.
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

      <footer className="border-t border-ocean-100 bg-white px-4 py-8 sm:px-6 lg:px-8" id="contacto">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 text-sm text-slate-500 md:flex-row">
          <p>© 2026 KineFlow. Gestión clínica para kinesiólogos.</p>
          <div className="flex gap-5">
            <a href="/login">Ingresar</a>
            <a href="/registro">Registrarse</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
