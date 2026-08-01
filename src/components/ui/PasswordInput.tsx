"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { clsx } from "clsx";
import { FieldLabel } from "@/components/ui/FieldLabel";

type PasswordInputProps = {
  autoComplete?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  minLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value: string;
};

export function PasswordInput({
  autoComplete,
  className,
  disabled,
  label,
  minLength,
  onChange,
  placeholder = "********",
  required,
  value,
}: PasswordInputProps) {
  const inputId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <label className={clsx("block", className)} htmlFor={inputId}>
      <FieldLabel required={required}>{label}</FieldLabel>
      <span className="mt-2 flex min-h-11 items-center gap-3 rounded-lg border border-ocean-100 bg-white px-4 py-3 focus-within:border-ocean-400">
        <LockKeyhole className="h-5 w-5 shrink-0 text-ocean-500" />
        <input
          autoComplete={autoComplete}
          className="w-full bg-transparent text-sm outline-none"
          disabled={disabled}
          id={inputId}
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-ocean-50 hover:text-ocean-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ocean-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </span>
    </label>
  );
}
