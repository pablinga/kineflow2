import { clsx } from "clsx";
import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow: string;
  /**
   * En el celular el título ya está en la barra superior (DashboardSidebar),
   * así que acá queda solo para lectores de pantalla. true lo mantiene
   * visible (por ejemplo, el saludo de Inicio).
   */
  keepTitleOnMobile?: boolean;
  title: ReactNode;
};

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  keepTitleOnMobile = false,
  title,
}: PageHeaderProps) {
  return (
    <header
      className={clsx(
        // En el celular no es una tarjeta: la pantalla arranca con su contenido.
        "lg:rounded-lg lg:border lg:border-ocean-100 lg:bg-white lg:p-6 lg:shadow-card",
        className,
      )}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className={keepTitleOnMobile ? undefined : "max-lg:sr-only"}>
          <p className="text-sm font-semibold text-ocean-700">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
