import type { ReactNode } from "react";

type AuthShellProps = {
  /** Contenido extra fuera de la card (por ejemplo, un modal). */
  after?: ReactNode;
  /** Contenido de la card. */
  children: ReactNode;
  /** Ancho de la card; por defecto el del registro. */
  cardClassName?: string;
};

/**
 * Layout de las pantallas de alta (registro y "Revisá tu correo"): card
 * blanca a la izquierda y panel azul de KineFlow a la derecha en desktop.
 */
export function AuthShell({ after, cardClassName = "max-w-3xl", children }: AuthShellProps) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex items-center justify-center px-4 py-6 sm:px-6 lg:py-8">
        <div
          className={`w-full ${cardClassName} rounded-lg border border-ocean-100 bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.08)] sm:p-6`}
        >
          {children}
        </div>
      </section>
      <section className="hidden items-center justify-center bg-ocean-700 p-10 text-white lg:flex">
        <div className="max-w-lg">
          <p className="text-sm font-bold uppercase tracking-wider text-ocean-100">
            KineFlow
          </p>
          <h2 className="mt-4 text-4xl font-bold">
            Tu practica independiente, ordenada desde el celular.
          </h2>
          <div className="mt-8 grid gap-3">
            {[
              "Pacientes, turnos y sesiones",
              "Evolución por tratamiento",
              "Cobros por sesion",
            ].map((item) => (
              <div
                className="rounded-lg border border-white/20 bg-white/10 px-4 py-3 font-semibold"
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
      {after}
    </main>
  );
}
