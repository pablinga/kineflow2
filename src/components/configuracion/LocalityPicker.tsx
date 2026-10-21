"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, MapPin, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { SelectedLocality } from "@/hooks/useWorkspacePublicProfile";
import { getSupabaseClient } from "@/lib/supabase";

type LocalityOption = {
  display_name: string;
  id: string;
  label: string;
  province_name: string;
};

type LocalityPickerProps = {
  disabled?: boolean;
  onChange: (locality: SelectedLocality | null) => void;
  value: SelectedLocality | null;
};

const MIN_CHARS = 3;

/**
 * Ciudad del perfil: se elige del maestro de localidades (Georef/INDEC) con
 * sugerencias desde 3 letras; no se puede guardar un texto libre.
 */
export function LocalityPicker({ disabled = false, onChange, value }: LocalityPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LocalityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debouncedQuery = useDebouncedValue(query, 250);
  const searchable = debouncedQuery.trim().length >= MIN_CHARS;

  useEffect(() => {
    if (!searchable) {
      setOptions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getSupabaseClient()
      .rpc("search_ar_localities", { max_results: 8, query: debouncedQuery })
      .then(({ data }) => {
        if (!cancelled) {
          setOptions((data ?? []) as LocalityOption[]);
          setActive(0);
        }
      })
      .then(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, searchable]);

  function choose(option: LocalityOption) {
    onChange({
      displayName: option.display_name,
      id: option.id,
      label: option.label,
      // Para CABA el nombre completo es la provincia.
      name: option.display_name === "CABA" ? option.province_name : option.display_name,
      province: option.province_name,
    });
    setQuery("");
    setOpen(false);
  }

  if (value) {
    return (
      <div className="mt-2 flex min-h-11 items-center justify-between gap-2 rounded-lg border border-ocean-200 bg-ocean-50 px-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-ocean-600" />
          <span className="truncate">{value.label}</span>
        </span>
        {!disabled ? (
          <button
            aria-label="Cambiar ciudad"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white"
            onClick={() => onChange(null)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  }

  const showList = open && searchable;

  return (
    <div className="relative">
      <input
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        autoComplete="off"
        className="mt-2 min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-3 text-sm outline-none focus:border-ocean-400 disabled:bg-slate-50"
        disabled={disabled}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (!showList || options.length === 0) {
            return;
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, options.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            choose(options[active]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Escribí al menos 3 letras (ej.: Rosario)"
        role="combobox"
        value={query}
      />
      {showList ? (
        <ul
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-ocean-100 bg-white py-1 shadow-soft"
          id={listId}
          role="listbox"
        >
          {loading && options.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </li>
          ) : null}
          {!loading && options.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-slate-600">
              No encontramos esa localidad. Probá con otro nombre.
            </li>
          ) : null}
          {options.map((option, index) => (
            <li
              aria-selected={index === active}
              className={`cursor-pointer px-3 py-2.5 text-sm ${
                index === active ? "bg-ocean-50 text-ocean-900" : "text-ink"
              }`}
              key={option.id}
              onMouseDown={(event) => {
                // Antes del blur del input, así no se cierra la lista sin elegir.
                event.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActive(index)}
              role="option"
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
