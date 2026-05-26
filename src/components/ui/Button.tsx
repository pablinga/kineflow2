import Link from "next/link";
import { type AnchorHTMLAttributes, type ButtonHTMLAttributes } from "react";
import { clsx } from "clsx";

type ButtonVariant = "primary" | "secondary" | "ghost";

const styles: Record<ButtonVariant, string> = {
  primary:
    "bg-ocean-600 text-white shadow-soft hover:bg-ocean-700 focus-visible:outline-ocean-400",
  secondary:
    "border border-ocean-200 bg-white text-ocean-800 hover:border-ocean-300 hover:bg-ocean-50 focus-visible:outline-ocean-300",
  ghost:
    "text-slate-700 hover:bg-ocean-50 hover:text-ocean-800 focus-visible:outline-ocean-300",
};

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

type LinkButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
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
