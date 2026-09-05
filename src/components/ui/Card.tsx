import { HTMLAttributes } from "react";
import { clsx } from "clsx";

type CardVariant = "default" | "success" | "warning" | "danger" | "dashed";
type CardPadding = "sm" | "md" | "lg";

const variantStyles: Record<CardVariant, string> = {
  default: "border-ocean-100 bg-white shadow-card",
  success: "border-emerald-100 bg-emerald-50 shadow-card",
  warning: "border-amber-100 bg-amber-50",
  danger: "border-rose-100 bg-rose-50",
  dashed: "border-dashed border-ocean-200 bg-ocean-50",
};

const paddingStyles: Record<CardPadding, string> = {
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-5",
  lg: "p-6",
};

type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: CardPadding;
  as?: "div" | "section" | "article";
};

export function Card({
  className,
  variant = "default",
  padding = "md",
  as: Component = "div",
  ...props
}: CardProps) {
  return (
    <Component
      className={clsx(
        "rounded-lg border",
        variantStyles[variant],
        paddingStyles[padding],
        className,
      )}
      {...props}
    />
  );
}
