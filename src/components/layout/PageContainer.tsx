import { clsx } from "clsx";
import type { ReactNode } from "react";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: "4xl" | "6xl" | "7xl" | "full";
};

const maxWidthClasses = {
  "4xl": "max-w-4xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-none",
};

export function PageContainer({
  children,
  className,
  maxWidth = "7xl",
}: PageContainerProps) {
  return (
    <section className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <div className={clsx("mx-auto", maxWidthClasses[maxWidth], className)}>
        {children}
      </div>
    </section>
  );
}
