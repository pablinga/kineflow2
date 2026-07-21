import Link from "next/link";
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ComponentProps,
} from "react";
import { clsx } from "clsx";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "success"
  | "danger"
  | "inverted";

const styles: Record<ButtonVariant, string> = {
  primary:
    "bg-ocean-500 text-white shadow-soft hover:bg-ocean-600 focus-visible:outline-ocean-300",
  secondary:
    "border border-ocean-100 bg-white text-ocean-800 hover:border-ocean-200 hover:bg-ocean-50 focus-visible:outline-ocean-300",
  ghost:
    "text-slate-700 hover:bg-ocean-50 hover:text-ocean-800 focus-visible:outline-ocean-300",
  success:
    "bg-emerald-500 text-white shadow-soft hover:bg-emerald-600 focus-visible:outline-emerald-300",
  danger:
    "bg-red-600 text-white shadow-soft hover:bg-red-700 focus-visible:outline-red-300",
  inverted:
    "bg-white text-ocean-900 shadow-soft hover:bg-ocean-50 focus-visible:outline-white",
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  prefetch?: ComponentProps<typeof Link>["prefetch"];
  variant?: ButtonVariant;
};

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps) {
  return (
    <button className={clsx(base, styles[variant], className)} {...props} />
  );
}

export function LinkButton({
  className,
  variant = "primary",
  href,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={clsx(base, styles[variant], className)}
      href={href}
      {...props}
    />
  );
}
