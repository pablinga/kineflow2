import Link from "next/link";
import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";
import type { Patient } from "@/hooks/usePatients";

type PatientCardProps = {
  /** Botones de la tarjeta (editar, menú, etc.). */
  actions?: ReactNode;
  /** Link a la ficha; null muestra el nombre como texto. */
  href: string | null;
  patient: Pick<
    Patient,
    | "condition"
    | "document"
    | "email"
    | "lastSession"
    | "name"
    | "nextAppointment"
    | "phone"
    | "status"
  >;
};

export function getPatientInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * Tarjeta de un paciente en la lista (vista Tarjetas). Solo presentación: la
 * usan Pacientes y la demo pública con datos ficticios.
 */
export function PatientCard({ actions = null, href, patient }: PatientCardProps) {
  const nameClass =
    "block truncate font-bold text-ink underline-offset-4 transition hover:text-ocean-700 hover:underline";

  return (
    <article
      className={`rounded-lg border p-4 shadow-card ${
        patient.status === "Activo" ? "border-ocean-100 bg-white" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ocean-100 text-sm font-bold text-ocean-800">
            {getPatientInitials(patient.name)}
          </div>
          <div className="min-w-0">
            {href ? (
              <Link className={nameClass} href={href} prefetch={false}>
                {patient.name}
              </Link>
            ) : (
              <p className="truncate font-bold text-ink">{patient.name}</p>
            )}
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">
              DNI {patient.document} · {patient.condition}
            </p>
            <span
              className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                patient.status === "Activo"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-200 text-slate-700"
              }`}
            >
              {patient.status}
            </span>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap justify-end">{actions}</div> : null}
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <p className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-ocean-600" />
          {patient.phone || "Sin teléfono"}
        </p>
        <p className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-ocean-600" />
          {patient.email || "Sin email"}
        </p>
      </div>
      <div className="mt-4 grid gap-3 border-t border-ocean-100 pt-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Última sesión</p>
          <p className="mt-1 text-sm font-semibold text-ocean-800">{patient.lastSession}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Próximo turno</p>
          <p
            className={`mt-1 text-sm font-semibold ${
              patient.nextAppointment === "Sin turno" ? "text-ocean-800" : "text-emerald-700"
            }`}
          >
            {patient.nextAppointment}
          </p>
        </div>
      </div>
    </article>
  );
}
