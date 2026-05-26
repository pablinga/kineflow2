import Link from "next/link";
import { Building2, Mail, LockKeyhole, UserRound } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export default function RegisterPage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_0.95fr]">
      <section className="flex items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-ocean-100 bg-white p-6 shadow-soft sm:p-8">
          <Logo />
          <div className="mt-8">
            <h1 className="text-3xl font-bold text-ink">Crear cuenta</h1>
            <p className="mt-2 text-slate-600">
              Comenzá a gestionar tu práctica con KineFlow.
            </p>
          </div>
          <form className="mt-8 space-y-5">
            {[
              {
                label: "Nombre completo",
                placeholder: "Dra. Sofía Ruiz",
                type: "text",
                icon: UserRound,
              },
              {
                label: "Consultorio o centro",
                placeholder: "Kinesio Norte",
                type: "text",
                icon: Building2,
              },
              {
                label: "Email",
                placeholder: "tu@email.com",
                type: "email",
                icon: Mail,
              },
              {
                label: "Contraseña",
                placeholder: "••••••••",
                type: "password",
                icon: LockKeyhole,
              },
            ].map((field) => {
              const Icon = field.icon;
              return (
                <label className="block" key={field.label}>
                  <span className="text-sm font-semibold text-slate-700">
                    {field.label}
                  </span>
                  <span className="mt-2 flex items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
                    <Icon className="h-5 w-5 text-ocean-500" />
                    <input
                      className="w-full bg-transparent text-sm outline-none"
                      placeholder={field.placeholder}
                      type={field.type}
                    />
                  </span>
                </label>
              );
            })}
            <Button className="w-full" type="button">
              Registrarme
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-slate-600">
            ¿Ya tenés cuenta?{" "}
            <Link className="font-semibold text-ocean-700" href="/login">
              Ingresar
            </Link>
          </p>
        </div>
      </section>
      <section className="hidden items-center justify-center bg-[radial-gradient(circle_at_top_right,#aee3ff,transparent_32%),linear-gradient(180deg,#0b97dc,#075f96)] p-10 text-white lg:flex">
        <div className="max-w-lg">
          <p className="text-sm font-bold uppercase tracking-wider text-ocean-100">
            SaaS clínico
          </p>
          <h2 className="mt-4 text-4xl font-bold">
            Una base clara para crecer con pacientes, sesiones y métricas.
          </h2>
          <div className="mt-8 grid gap-3">
            {["Agenda simple", "Evoluciones por sesión", "Pacientes recientes"].map(
              (item) => (
                <div
                  className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 font-semibold"
                  key={item}
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
