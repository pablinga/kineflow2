import { clsx } from "clsx";
import type { ReactNode } from "react";

type PageHeaderProps = {
  actions?: ReactNode;
  className?: string;
  description?: ReactNode;
  eyebrow: string;
  title: ReactNode;
};

export function PageHeader({
  actions,
  className,
  description,
  eyebrow,
  title,
}: PageHeaderProps) {
  return (
    <header
      className={clsx(
        "rounded-lg border border-ocean-100 bg-white p-5 shadow-card sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
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
