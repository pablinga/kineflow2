"use client";

import { useEffect, useState } from "react";
import type { Patient } from "@/hooks/usePatients";

type PatientSearchSelectProps = {
  disabled?: boolean;
  includeAllOption?: boolean;
  label?: string;
  onChange: (patientId: string) => void;
  patients: Patient[];
  required?: boolean;
  value: string;
};

export function PatientSearchSelect({
  disabled = false,
  includeAllOption = false,
  label = "Paciente",
  onChange,
  patients,
  required = false,
  value,
}: PatientSearchSelectProps) {
  const listId = `${label.toLowerCase().replace(/\s+/g, "-")}-patients`;
  const selectedValue =
    value === "all"
      ? "Todos"
      : patients.find((patient) => patient.id === value)?.name ?? "";
  const [searchValue, setSearchValue] = useState(selectedValue);

  useEffect(() => {
    setSearchValue(selectedValue);
  }, [selectedValue]);

  function handleChange(nextValue: string) {
    setSearchValue(nextValue);

    if (includeAllOption && nextValue.trim().toLowerCase() === "todos") {
      onChange("all");
      return;
    }

    const normalizedValue = nextValue.trim().toLowerCase();
    const selectedPatient = patients.find(
      (patient) => patient.name.toLowerCase() === normalizedValue,
    );

    if (selectedPatient) {
      onChange(selectedPatient.id);
    } else if (!nextValue.trim()) {
      onChange(includeAllOption ? "all" : "");
    }
  }

  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
        disabled={disabled}
        list={listId}
        onBlur={() => setSearchValue(selectedValue)}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={
          includeAllOption ? "Todos o buscar paciente" : "Buscar paciente"
        }
        required={required}
        type="text"
        value={searchValue}
      />
      <datalist id={listId}>
        {includeAllOption ? <option value="Todos" /> : null}
        {patients.map((patient) => (
          <option key={patient.id} value={patient.name} />
        ))}
      </datalist>
    </label>
  );
}
