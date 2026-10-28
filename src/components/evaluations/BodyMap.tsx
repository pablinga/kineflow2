"use client";

import { type KeyboardEvent, useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  BODY_FIGURES,
  type BodyFigure,
  type BodyFigureSex,
  type BodyFigureView,
} from "@/lib/body-map-figures";
import {
  getBodyZoneKey,
  getBodyZoneLabel,
  normalizeBodyZones,
  searchBodyZones,
  toggleBodyZone,
} from "@/lib/body-zones";

const FIGURE_SEX_STORAGE_KEY = "kineflow.bodymap.figure";

/** Silueta elegida (mujer / hombre), recordada en el dispositivo. */
function useBodyFigureSex() {
  const [sex, setSex] = useState<BodyFigureSex>("female");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(FIGURE_SEX_STORAGE_KEY);

      if (stored === "female" || stored === "male") {
        setSex(stored);
      }
    } catch {
      // Sin acceso a localStorage: queda la silueta por defecto.
    }
  }, []);

  function changeSex(next: BodyFigureSex) {
    setSex(next);

    try {
      window.localStorage.setItem(FIGURE_SEX_STORAGE_KEY, next);
    } catch {
      // No se recuerda la elección, pero el mapa sigue funcionando.
    }
  }

  return [sex, changeSex] as const;
}

type BodyFigureSvgProps = {
  figure: BodyFigure;
  onToggle?: (key: string) => void;
  selected: ReadonlySet<string>;
  view: BodyFigureView;
  className?: string;
};

function BodyFigureSvg({ className, figure, onToggle, selected, view }: BodyFigureSvgProps) {
  const interactive = Boolean(onToggle);

  function zoneProps(key: string) {
    const isSelected = selected.has(key);
    const label = getBodyZoneLabel(key);
    const base = isSelected ? "fill-ocean-600" : "fill-slate-300";

    if (!interactive) {
      return { className: base };
    }

    return {
      "aria-label": label,
      "aria-pressed": isSelected,
      className: `${base} cursor-pointer transition-colors focus:outline-none focus-visible:stroke-ink focus-visible:[stroke-width:6] ${
        isSelected ? "hover:fill-ocean-500" : "hover:fill-ocean-300"
      }`,
      onClick: () => onToggle?.(key),
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle?.(key);
        }
      },
      role: "button",
      tabIndex: 0,
    };
  }

  return (
    <svg
      aria-label={view === "front" ? "Cuerpo de frente" : "Cuerpo de espalda"}
      className={className}
      role={interactive ? "group" : "img"}
      viewBox={figure.viewBox}
    >
      {figure.neutral.map((d, index) => (
        <path className="fill-slate-200" d={d} key={`n${index}`} />
      ))}
      <g className="stroke-ocean-50 [stroke-linejoin:round] [stroke-width:1.5]">
        {figure.shapes.map(([zoneId, side, d], index) => {
          const key = getBodyZoneKey(zoneId, side) ?? zoneId;

          return (
            <path d={d} key={`s${index}`} {...zoneProps(key)}>
              {interactive ? <title>{getBodyZoneLabel(key)}</title> : null}
            </path>
          );
        })}
        {figure.dots.map(([zoneId, side, cx, cy, rx, ry]) => {
          const key = getBodyZoneKey(zoneId, side) ?? zoneId;

          return (
            <ellipse cx={cx} cy={cy} key={key} rx={rx} ry={ry} {...zoneProps(key)}>
              {interactive ? <title>{getBodyZoneLabel(key)}</title> : null}
            </ellipse>
          );
        })}
      </g>
    </svg>
  );
}

type BodyMapPickerProps = {
  onChange: (zones: string[]) => void;
  value: string[];
};

/** Mapa para marcar las zonas a tratar, con lista y buscador como alternativa. */
export function BodyMapPicker({ onChange, value }: BodyMapPickerProps) {
  const [sex, setSex] = useBodyFigureSex();
  const [listOpen, setListOpen] = useState(false);
  const [search, setSearch] = useState("");
  const zones = normalizeBodyZones(value);
  const selected = new Set(zones);
  const figures = BODY_FIGURES[sex];

  function toggle(key: string) {
    onChange(toggleBodyZone(zones, key));
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="inline-flex rounded-full bg-ocean-50 p-1" role="group" aria-label="Silueta">
        {(
          [
            ["female", "Mujer"],
            ["male", "Hombre"],
          ] as const
        ).map(([option, label]) => (
          <button
            aria-pressed={sex === option}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              sex === option ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink"
            }`}
            key={option}
            onClick={() => setSex(option)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-ocean-50 px-2 pb-2 pt-3">
        {(["front", "back"] as const).map((view) => (
          <div className="flex min-w-0 flex-col items-center gap-1" key={view}>
            <div className="flex w-full max-w-[200px] justify-between px-1.5 text-[10px] font-bold tracking-wide text-slate-500">
              <span>{view === "front" ? "DER" : "IZQ"}</span>
              <span>{view === "front" ? "IZQ" : "DER"}</span>
            </div>
            <BodyFigureSvg
              className="h-auto w-full max-w-[200px]"
              figure={figures[view]}
              onToggle={toggle}
              selected={selected}
              view={view}
            />
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {view === "front" ? "Frente" : "Espalda"}
            </span>
          </div>
        ))}
      </div>

      {zones.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {zones.map((key) => (
            <button
              aria-label={`Quitar ${getBodyZoneLabel(key)}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-ocean-300 bg-ocean-50 py-1 pl-3 pr-2 text-sm font-semibold text-ocean-800 transition hover:border-ocean-500"
              key={key}
              onClick={() => toggle(key)}
              type="button"
            >
              {getBodyZoneLabel(key)}
              <X className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Tocá en el dibujo las zonas a tratar.</p>
      )}

      <button
        aria-expanded={listOpen}
        className="text-sm font-semibold text-ocean-700 hover:text-ocean-800"
        onClick={() => setListOpen((current) => !current)}
        type="button"
      >
        {listOpen ? "Ocultar la lista" : "Elegir de una lista"}
      </button>

      {listOpen ? (
        <div className="space-y-3 border-t border-dashed border-ocean-100 pt-3">
          <input
            className="min-h-11 w-full rounded-lg border border-ocean-100 bg-white px-4 text-sm outline-none focus:border-ocean-400"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar zona (ej. rodilla, lumbar)"
            type="search"
            value={search}
          />
          {searchBodyZones(search).map((group) => (
            <div key={group.name}>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
                {group.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {group.keys.map((key) => (
                  <button
                    aria-pressed={selected.has(key)}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      selected.has(key)
                        ? "border-ocean-600 bg-ocean-600 text-white"
                        : "border-ocean-100 bg-white text-slate-700 hover:border-ocean-400"
                    }`}
                    key={key}
                    onClick={() => toggle(key)}
                    type="button"
                  >
                    {getBodyZoneLabel(key)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {searchBodyZones(search).length === 0 ? (
            <p className="text-sm text-slate-500">No hay zonas con ese nombre.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Siluetas chicas, solo lectura, con las zonas marcadas. */
export function BodyMapPreview({ zones }: { zones: string[] }) {
  const [sex] = useBodyFigureSex();
  const selected = new Set(normalizeBodyZones(zones));

  return (
    <div aria-hidden="true" className="inline-flex shrink-0 gap-1 rounded-lg bg-ocean-50 p-1.5">
      {(["front", "back"] as const).map((view) => (
        <BodyFigureSvg
          className="h-auto w-12"
          figure={BODY_FIGURES[sex][view]}
          key={view}
          selected={selected}
          view={view}
        />
      ))}
    </div>
  );
}
