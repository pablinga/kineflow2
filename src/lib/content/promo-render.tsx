import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { buildSeriesCalendar, type PromoFields } from "./promo-image.ts";

// Pieza "promo" 1080×1350 (feed de Instagram): bajada arriba, una maqueta de
// la app en el medio y la marca abajo. next/og (Satori) arma el PNG y sharp
// lo pasa a JPEG. Satori solo entiende flexbox: todo div con más de un hijo
// lleva display: flex.

const INK = "#0D1B2A";
const BRAND = "#1565FF";
const GREEN = "#22C1A1";
const MUTED = "#4A5568";
const BACKGROUND = "#F5F7FA";
const CARD_BORDER = "#DCE8FF";
const SLOT_BORDER = "#BCD1FF";
const WIDTH = 1080;
const HEIGHT = 1350;

const assetsDir = path.join(process.cwd(), "src/assets/social");
let assetsPromise: Promise<{ bold: Buffer; icon: string; medium: Buffer }> | null = null;

function loadAssets() {
  assetsPromise ??= Promise.all([
    readFile(path.join(assetsDir, "inter-latin-800-normal.woff")),
    readFile(path.join(assetsDir, "inter-latin-500-normal.woff")),
    readFile(path.join(assetsDir, "kineflow-icon.svg")),
  ]).then(([bold, medium, icon]) => ({
    bold,
    icon: `data:image/svg+xml;base64,${icon.toString("base64")}`,
    medium,
  }));

  return assetsPromise;
}

const cardStyle = {
  background: "#FFFFFF",
  border: `2px solid ${CARD_BORDER}`,
  borderRadius: 40,
  boxShadow: "0 30px 70px rgba(21,101,255,0.16)",
  display: "flex",
} as const;

function Slot({ label, selected, width }: { label: string; selected: boolean; width: number }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: selected ? BRAND : "#FFFFFF",
        border: `3px solid ${selected ? BRAND : SLOT_BORDER}`,
        borderRadius: 18,
        color: selected ? "#FFFFFF" : BRAND,
        display: "flex",
        fontSize: 32,
        fontWeight: 800,
        height: 80,
        justifyContent: "center",
        width,
      }}
    >
      {label}
    </div>
  );
}

function initials(name: string) {
  const words = name.replace(/^(lic|dr|dra|klgo|klga)\.?\s+/i, "").split(" ").filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "K";
}

function PerfilVisual({ fields }: { fields: NonNullable<PromoFields["perfil"]> }) {
  const slotWidth = fields.slots.length ? Math.floor((616 - 14 * (fields.slots.length - 1)) / fields.slots.length) : 0;

  return (
    <div style={{ ...cardStyle, flexDirection: "column", gap: 30, padding: "48px 52px", width: 720 }}>
      <div style={{ alignItems: "center", display: "flex", gap: 28 }}>
        <div
          style={{
            alignItems: "center",
            background: CARD_BORDER,
            borderRadius: 999,
            color: BRAND,
            display: "flex",
            fontSize: 44,
            fontWeight: 800,
            height: 120,
            justifyContent: "center",
            width: 120,
          }}
        >
          {initials(fields.name)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 42, fontWeight: 800 }}>{fields.name}</div>
          {fields.place ? <div style={{ color: MUTED, display: "flex", fontSize: 30 }}>{fields.place}</div> : null}
        </div>
      </div>
      {fields.chips.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {fields.chips.map((chip) => (
            <div
              key={chip}
              style={{ background: "#EEF4FF", borderRadius: 999, display: "flex", fontSize: 28, padding: "12px 22px" }}
            >
              {chip}
            </div>
          ))}
        </div>
      ) : null}
      {fields.slots.length ? (
        <div style={{ display: "flex", gap: 14 }}>
          {fields.slots.map((slot, index) => (
            <Slot key={slot} label={slot} selected={index === fields.selected} width={slotWidth} />
          ))}
        </div>
      ) : null}
      <div
        style={{
          alignItems: "center",
          background: BRAND,
          borderRadius: 22,
          color: "#FFFFFF",
          display: "flex",
          fontSize: 34,
          fontWeight: 800,
          height: 96,
          justifyContent: "center",
        }}
      >
        Reservar turno
      </div>
    </div>
  );
}

function ReservasVisual({ fields }: { fields: NonNullable<PromoFields["reservas"]> }) {
  const rows = [fields.slots.slice(0, 3), fields.slots.slice(3, 6)].filter((row) => row.length);

  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ ...cardStyle, flexDirection: "column", gap: 14, padding: "40px 48px", width: 760 }}>
        {fields.day ? (
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, marginBottom: 10 }}>{fields.day}</div>
        ) : null}
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: "flex", gap: 14 }}>
            {row.map((slot, index) => (
              <Slot key={slot} label={slot} selected={rowIndex * 3 + index === fields.selected} width={209} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ ...cardStyle, alignItems: "center", border: "2px solid #BDEFE3", gap: 26, padding: "30px 40px", width: 760 }}>
        <div
          style={{
            alignItems: "center",
            background: GREEN,
            borderRadius: 999,
            display: "flex",
            height: 76,
            justifyContent: "center",
            width: 76,
          }}
        >
          <svg fill="none" height="40" stroke="#FFFFFF" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" viewBox="0 0 24 24" width="40">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>{fields.confirmTitle}</div>
          {fields.confirmText ? (
            <div style={{ color: MUTED, display: "flex", fontSize: 28 }}>{fields.confirmText}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EvolucionVisual({ fields }: { fields: NonNullable<PromoFields["evolucion"]> }) {
  return (
    <div style={{ alignItems: "center", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ ...cardStyle, alignItems: "center", gap: 24, justifyContent: "space-between", padding: "30px 40px", width: 760 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 22 }}>
          {fields.time ? (
            <div style={{ color: BRAND, display: "flex", fontSize: 34, fontWeight: 800 }}>{fields.time}</div>
          ) : null}
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>{fields.patient}</div>
        </div>
        <div
          style={{
            alignItems: "center",
            background: "#E3F8F2",
            borderRadius: 999,
            color: "#0E7C66",
            display: "flex",
            fontSize: 28,
            fontWeight: 800,
            gap: 10,
            padding: "12px 22px",
          }}
        >
          <svg fill="none" height="28" stroke="#0E7C66" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" viewBox="0 0 24 24" width="28">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Asistió
        </div>
      </div>
      <div style={{ ...cardStyle, flexDirection: "column", gap: 22, padding: "40px 48px", width: 760 }}>
        <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>Registrar evolución</div>
          {fields.session ? <div style={{ color: MUTED, display: "flex", fontSize: 26 }}>{fields.session}</div> : null}
        </div>
        <div
          style={{
            background: BACKGROUND,
            border: `2px solid ${CARD_BORDER}`,
            borderRadius: 18,
            color: INK,
            display: "flex",
            fontSize: 28,
            lineHeight: 1.4,
            minHeight: 150,
            padding: "22px 26px",
          }}
        >
          {fields.note}
        </div>
        <div
          style={{
            alignItems: "center",
            background: BRAND,
            borderRadius: 22,
            color: "#FFFFFF",
            display: "flex",
            fontSize: 32,
            fontWeight: 800,
            height: 88,
            justifyContent: "center",
          }}
        >
          Guardar evolución
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_LETTERS =["L", "M", "M", "J", "V", "S", "D"];
const HOLIDAY_FILL = "#F8D27A";

function SerieVisual({ fields }: { fields: NonNullable<PromoFields["serie"]> }) {
  const cells = buildSeriesCalendar(fields);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const cellWidth = 92;

  return (
    <div style={{ ...cardStyle, flexDirection: "column", gap: 10, padding: "44px 48px", width: 800 }}>
      <div style={{ alignItems: "baseline", display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>{fields.monthName}</div>
        {fields.label ? <div style={{ color: MUTED, display: "flex", fontSize: 28 }}>{fields.label}</div> : null}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        {WEEKDAY_LETTERS.map((letter, index) => (
          <div
            key={index}
            style={{ color: "#8A94A6", display: "flex", fontSize: 24, fontWeight: 800, justifyContent: "center", width: cellWidth }}
          >
            {letter}
          </div>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div key={weekIndex} style={{ display: "flex", gap: 10 }}>
          {week.map((cell, index) => {
            if (cell.kind === "blank") {
              return <div key={index} style={{ display: "flex", height: 62, width: cellWidth }} />;
            }
            const background =
              cell.kind === "session" ? BRAND : cell.kind === "holiday" ? HOLIDAY_FILL : BACKGROUND;
            return (
              <div
                key={index}
                style={{
                  alignItems: "center",
                  background,
                  borderRadius: 14,
                  color: cell.kind === "session" ? "#FFFFFF" : INK,
                  display: "flex",
                  fontSize: 28,
                  fontWeight: 800,
                  height: 62,
                  justifyContent: "center",
                  width: cellWidth,
                }}
              >
                {String(cell.day)}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ color: MUTED, display: "flex", fontSize: 26, gap: 28, marginTop: 16 }}>
        <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
          <div style={{ background: BRAND, borderRadius: 6, display: "flex", height: 22, width: 22 }} />
          Sesión
        </div>
        {cells.some((cell) => cell.kind === "holiday") ? (
          <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
            <div style={{ background: HOLIDAY_FILL, borderRadius: 6, display: "flex", height: 22, width: 22 }} />
            Feriado salteado
          </div>
        ) : null}
      </div>
    </div>
  );
}

export async function renderPromoJpeg(fields: PromoFields) {
  const assets = await loadAssets();
  let visual: React.ReactNode = null;

  if (fields.visual === "perfil" && fields.perfil) visual = <PerfilVisual fields={fields.perfil} />;
  if (fields.visual === "reservas" && fields.reservas) visual = <ReservasVisual fields={fields.reservas} />;
  if (fields.visual === "serie" && fields.serie) visual = <SerieVisual fields={fields.serie} />;
  if (fields.visual === "evolucion" && fields.evolucion) visual = <EvolucionVisual fields={fields.evolucion} />;

  const response = new ImageResponse(
    (
      <div
        style={{
          background: BACKGROUND,
          color: INK,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter",
          height: "100%",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: GREEN,
            borderRadius: 999,
            display: "flex",
            height: 520,
            opacity: 0.12,
            position: "absolute",
            right: -180,
            top: -160,
            width: 520,
          }}
        />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: "96px 88px 0" }}>
          {fields.eyebrow ? (
            <div style={{ color: BRAND, display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 3 }}>
              {fields.eyebrow.toUpperCase()}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02, marginTop: 22 }}>
            <div style={{ display: "flex" }}>{fields.title}</div>
            {fields.highlight ? <div style={{ color: BRAND, display: "flex" }}>{fields.highlight}</div> : null}
          </div>
          {fields.subtitle ? (
            <div style={{ color: MUTED, display: "flex", fontSize: 38, lineHeight: 1.35, marginTop: 28, maxWidth: 860 }}>
              {fields.subtitle}
            </div>
          ) : null}
          <div style={{ alignItems: "center", display: "flex", flex: 1, justifyContent: "center" }}>{visual}</div>
        </div>
        <div
          style={{
            alignItems: "center",
            background: INK,
            color: "#FFFFFF",
            display: "flex",
            height: 150,
            justifyContent: "space-between",
            padding: "0 88px",
          }}
        >
          <div style={{ alignItems: "center", display: "flex", fontSize: 40, fontWeight: 800, gap: 20 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" height={68} src={assets.icon} width={68} />
            KineFlow
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>
            {fields.cta ? `${fields.cta} · ` : ""}
            <span style={{ color: GREEN, marginLeft: fields.cta ? 10 : 0 }}>kineflow.ar</span>
          </div>
        </div>
      </div>
    ),
    {
      fonts: [
        { data: assets.medium, name: "Inter", style: "normal", weight: 500 },
        { data: assets.bold, name: "Inter", style: "normal", weight: 800 },
      ],
      height: HEIGHT,
      width: WIDTH,
    },
  );

  const png = Buffer.from(await response.arrayBuffer());
  return sharp(png).flatten({ background: BACKGROUND }).jpeg({ mozjpeg: true, quality: 90 }).toBuffer();
}
