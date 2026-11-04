"use client";

type OptionalPainSelectProps = {
  onChange: (value: number | null) => void;
  value: number | null;
};

const PAIN_LEVELS = Array.from({ length: 11 }, (_, level) => level);

/** Dolor de la sesión (0–10), opcional: "Sin registrar" guarda null. */
export function OptionalPainSelect({ onChange, value }: OptionalPainSelectProps) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700">Dolor (opcional)</span>
      <select
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        value={value === null ? "" : String(value)}
      >
        <option value="">Sin registrar</option>
        {PAIN_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}/10{level === 0 ? " · sin dolor" : level === 10 ? " · máximo" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
