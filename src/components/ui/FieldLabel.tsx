import type { ReactNode } from "react";

type FieldLabelProps = {
  children: ReactNode;
  className?: string;
  required?: boolean;
};

export function FieldLabel({
  children,
  className = "text-sm font-semibold text-slate-700",
  required = false,
}: FieldLabelProps) {
  return (
    <span className={className}>
      {children}
      {required ? <span className="text-red-600"> *</span> : null}
    </span>
  );
}
