import { clsx } from "clsx";
import type { ReactNode } from "react";

type AlertTone = "error" | "success" | "warning" | "info";

const toneStyles: Record<AlertTone, string> = {
  error: "border-red-100 bg-red-50 text-red-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  warning: "border-amber-100 bg-amber-50 text-amber-800",
  info: "border-ocean-100 bg-ocean-50 text-ocean-800",
};

type AlertProps = {
  children: ReactNode;
  className?: string;
  title?: string;
  tone?: AlertTone;
};

export function Alert({
  children,
  className,
  title,
  tone = "info",
}: AlertProps) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm font-medium",
        toneStyles[tone],
        className,
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      <div className={clsx(title && "mt-1")}>{children}</div>
    </div>
  );
}
