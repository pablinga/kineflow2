"use client";

import { cloneElement, useState, type ReactElement, type SVGProps } from "react";
import { clsx } from "clsx";

type RegionId =
  | "cervical"
  | "hombro_izquierdo"
  | "hombro_derecho"
  | "dorsal"
  | "lumbar"
  | "codo_izquierdo"
  | "codo_derecho"
  | "muneca_mano_izquierda"
  | "muneca_mano_derecha"
  | "cadera_izquierda"
  | "cadera_derecha"
  | "rodilla_izquierda"
  | "rodilla_derecha"
  | "tobillo_pie_izquierdo"
  | "tobillo_pie_derecho";

const REGION_LABELS: Record<RegionId, string> = {
  cervical: "Cervical",
  hombro_izquierdo: "Hombro izquierdo",
  hombro_derecho: "Hombro derecho",
  dorsal: "Dorsal",
  lumbar: "Lumbar",
  codo_izquierdo: "Codo izquierdo",
  codo_derecho: "Codo derecho",
  muneca_mano_izquierda: "Muñeca/mano izquierda",
  muneca_mano_derecha: "Muñeca/mano derecha",
  cadera_izquierda: "Cadera izquierda",
  cadera_derecha: "Cadera derecha",
  rodilla_izquierda: "Rodilla izquierda",
  rodilla_derecha: "Rodilla derecha",
  tobillo_pie_izquierdo: "Tobillo/pie izquierdo",
  tobillo_pie_derecho: "Tobillo/pie derecho",
};

const FRONT_REGIONS: { id: RegionId; shape: ReactElement<SVGProps<SVGElement>> }[] = [
  { id: "cervical", shape: <rect height={18} rx={6} width={28} x={96} y={60} /> },
  { id: "hombro_izquierdo", shape: <ellipse cx={53} cy={88} rx={16} ry={14} /> },
  { id: "hombro_derecho", shape: <ellipse cx={167} cy={88} rx={16} ry={14} /> },
  { id: "codo_izquierdo", shape: <rect height={20} rx={8} width={24} x={38} y={150} /> },
  { id: "codo_derecho", shape: <rect height={20} rx={8} width={24} x={158} y={150} /> },
  {
    id: "muneca_mano_izquierda",
    shape: <rect height={20} rx={8} width={22} x={34} y={212} />,
  },
  {
    id: "muneca_mano_derecha",
    shape: <rect height={20} rx={8} width={22} x={164} y={212} />,
  },
  { id: "cadera_izquierda", shape: <rect height={26} rx={10} width={34} x={76} y={196} /> },
  { id: "cadera_derecha", shape: <rect height={26} rx={10} width={34} x={110} y={196} /> },
  { id: "rodilla_izquierda", shape: <rect height={26} rx={10} width={26} x={80} y={280} /> },
  { id: "rodilla_derecha", shape: <rect height={26} rx={10} width={26} x={114} y={280} /> },
  {
    id: "tobillo_pie_izquierdo",
    shape: <ellipse cx={93} cy={388} rx={18} ry={14} />,
  },
  {
    id: "tobillo_pie_derecho",
    shape: <ellipse cx={127} cy={388} rx={18} ry={14} />,
  },
];

const BACK_REGIONS: { id: RegionId; shape: ReactElement<SVGProps<SVGElement>> }[] = [
  { id: "cervical", shape: <rect height={18} rx={6} width={28} x={96} y={60} /> },
  { id: "hombro_izquierdo", shape: <ellipse cx={53} cy={88} rx={16} ry={14} /> },
  { id: "hombro_derecho", shape: <ellipse cx={167} cy={88} rx={16} ry={14} /> },
  { id: "dorsal", shape: <rect height={42} rx={10} width={48} x={86} y={86} /> },
  { id: "lumbar", shape: <rect height={42} rx={10} width={48} x={86} y={152} /> },
  { id: "codo_izquierdo", shape: <rect height={20} rx={8} width={24} x={38} y={150} /> },
  { id: "codo_derecho", shape: <rect height={20} rx={8} width={24} x={158} y={150} /> },
  {
    id: "muneca_mano_izquierda",
    shape: <rect height={20} rx={8} width={22} x={34} y={212} />,
  },
  {
    id: "muneca_mano_derecha",
    shape: <rect height={20} rx={8} width={22} x={164} y={212} />,
  },
  { id: "cadera_izquierda", shape: <rect height={26} rx={10} width={34} x={76} y={196} /> },
  { id: "cadera_derecha", shape: <rect height={26} rx={10} width={34} x={110} y={196} /> },
  { id: "rodilla_izquierda", shape: <rect height={26} rx={10} width={26} x={80} y={280} /> },
  { id: "rodilla_derecha", shape: <rect height={26} rx={10} width={26} x={114} y={280} /> },
  {
    id: "tobillo_pie_izquierdo",
    shape: <ellipse cx={93} cy={388} rx={18} ry={14} />,
  },
  {
    id: "tobillo_pie_derecho",
    shape: <ellipse cx={127} cy={388} rx={18} ry={14} />,
  },
];

const BODY_OUTLINE = (
  <g fill="#D7E3FB" stroke="#B7C9EE" strokeWidth={1.5}>
    <circle cx={110} cy={38} r={24} />
    <rect height={18} rx={6} width={24} x={98} y={60} />
    <path d="M70,80 Q110,66 150,80 L158,150 Q110,168 62,150 Z" />
    <rect height={80} rx={13} width={26} x={40} y={82} />
    <rect height={80} rx={13} width={26} x={154} y={82} />
    <rect height={70} rx={11} width={22} x={34} y={160} />
    <rect height={70} rx={11} width={22} x={164} y={160} />
    <rect height={60} rx={10} width={68} x={76} y={150} />
    <rect height={95} rx={13} width={26} x={80} y={205} />
    <rect height={95} rx={13} width={26} x={114} y={205} />
    <rect height={80} rx={13} width={26} x={80} y={298} />
    <rect height={80} rx={13} width={26} x={114} y={298} />
    <ellipse cx={93} cy={392} rx={16} ry={10} />
    <ellipse cx={127} cy={392} rx={16} ry={10} />
  </g>
);

type BodyRegionPickerProps = {
  onSelect: (label: string) => void;
  value: string;
};

export function BodyRegionPicker({ onSelect, value }: BodyRegionPickerProps) {
  const [view, setView] = useState<"front" | "back">("front");
  const regions = view === "front" ? FRONT_REGIONS : BACK_REGIONS;

  return (
    <div>
      <div className="flex gap-2">
        {(["front", "back"] as const).map((option) => (
          <button
            className={clsx(
              "min-h-9 rounded-lg border px-3 text-sm font-semibold transition",
              view === option
                ? "border-ocean-400 bg-ocean-50 text-ocean-700"
                : "border-ocean-100 bg-white text-slate-500 hover:bg-ocean-50",
            )}
            key={option}
            onClick={() => setView(option)}
            type="button"
          >
            {option === "front" ? "Frontal" : "Posterior"}
          </button>
        ))}
      </div>

      <svg
        className="mx-auto mt-3 h-64 w-auto"
        viewBox="0 0 220 420"
        xmlns="http://www.w3.org/2000/svg"
      >
        {BODY_OUTLINE}
        <g>
          {regions.map((region) => {
            const label = REGION_LABELS[region.id];
            const isSelected = value === label;

            return (
              <g
                aria-label={label}
                className="cursor-pointer outline-none"
                key={region.id}
                onClick={() => onSelect(label)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(label);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {cloneElement(region.shape, {
                  className: clsx(
                    "stroke-[1.5] transition",
                    isSelected
                      ? "fill-emerald-500/40 stroke-emerald-600"
                      : "fill-ocean-500/0 stroke-ocean-300 hover:fill-ocean-500/15",
                  ),
                })}
              </g>
            );
          })}
        </g>
      </svg>

      <p className="mt-2 text-center text-sm font-semibold text-ocean-700">
        {value || "Tocá una zona del cuerpo"}
      </p>
    </div>
  );
}
