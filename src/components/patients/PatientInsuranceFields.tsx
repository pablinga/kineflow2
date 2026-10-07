"use client";

import type { InsuranceProvider } from "@/hooks/useInsuranceProviders";

type PatientInsuranceFieldsProps = {
  memberNumber: string;
  onChange: (field: "insuranceMemberNumber" | "insuranceProviderId", value: string) => void;
  providerId: string;
  providers: InsuranceProvider[];
};

/**
 * Obra social y número de afiliado del paciente. Se ofrecen las obras sociales
 * activas; si el paciente tiene una que se desactivó, se sigue mostrando para
 * no perderla al editar. Sin obras sociales cargadas no se muestra nada.
 */
export function PatientInsuranceFields({
  memberNumber,
  onChange,
  providerId,
  providers,
}: PatientInsuranceFieldsProps) {
  const options = providers.filter(
    (provider) => provider.active || provider.id === providerId,
  );

  if (options.length === 0) {
    return null;
  }

  return (
    <>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Obra social</span>
        <select
          className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
          onChange={(event) => onChange("insuranceProviderId", event.target.value)}
          value={providerId}
        >
          <option value="">Sin obra social</option>
          {options.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">Número de afiliado</span>
        <input
          className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 px-4 text-sm outline-none focus:border-ocean-400"
          maxLength={50}
          onChange={(event) => onChange("insuranceMemberNumber", event.target.value)}
          type="text"
          value={memberNumber}
        />
      </label>
    </>
  );
}
