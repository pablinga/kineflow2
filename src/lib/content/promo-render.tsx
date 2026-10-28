import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { buildSeriesCalendar, type PromoFields, type PromoTheme } from "./promo-image.ts";

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

type ThemeColors = {
  background: string;
  bezel: string;
  blob: string;
  blobOpacity: number;
  eyebrow: string;
  footer: string;
  highlight: string;
  muted: string;
  sticker: string;
  text: string;
};

const THEMES: Record<PromoTheme, ThemeColors> = {
  azul: {
    background: BRAND, bezel: INK, blob: "#FFFFFF", blobOpacity: 0.1, eyebrow: "#BDEFE3", footer: INK,
    highlight: "#BDEFE3", muted: "#DCE8FF", sticker: INK, text: "#FFFFFF",
  },
  claro: {
    background: BACKGROUND, bezel: INK, blob: GREEN, blobOpacity: 0.12, eyebrow: BRAND, footer: INK,
    highlight: BRAND, muted: MUTED, sticker: GREEN, text: INK,
  },
  oscuro: {
    background: INK, bezel: "#24364D", blob: BRAND, blobOpacity: 0.35, eyebrow: GREEN, footer: "#060E17",
    highlight: GREEN, muted: "#B8C4D6", sticker: BRAND, text: "#FFFFFF",
  },
};

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
  color: INK,
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

function TarjetaVisual({ fields }: { fields: NonNullable<PromoFields["tarjeta"]> }) {
  const percent = fields.progress ? Math.round((fields.progress.current / fields.progress.total) * 100) : 0;

  return (
    <div style={{ ...cardStyle, flexDirection: "column", gap: 26, padding: "40px 48px", width: 820 }}>
      <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>{fields.title}</div>
      {fields.progress ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800, justifyContent: "space-between" }}>
            <div style={{ display: "flex" }}>{fields.progress.label}</div>
            <div style={{ color: BRAND, display: "flex" }}>
              {`${fields.progress.current} de ${fields.progress.total}`}
            </div>
          </div>
          <div style={{ background: CARD_BORDER, borderRadius: 999, display: "flex", height: 22, width: "100%" }}>
            <div style={{ background: BRAND, borderRadius: 999, display: "flex", height: 22, width: `${percent}%` }} />
          </div>
        </div>
      ) : null}
      {fields.rows.length ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {fields.rows.map((row, index) => (
            <div
              key={`${row.label}-${index}`}
              style={{
                borderTop: index === 0 ? "none" : `2px solid ${CARD_BORDER}`,
                display: "flex",
                fontSize: 30,
                justifyContent: "space-between",
                padding: "16px 0",
              }}
            >
              <div style={{ color: MUTED, display: "flex" }}>{row.label}</div>
              <div style={{ display: "flex", fontWeight: 800 }}>{row.value}</div>
            </div>
          ))}
        </div>
      ) : null}
      {fields.note ? (
        <div
          style={{
            alignItems: "center",
            background: "#E3F8F2",
            borderRadius: 22,
            color: "#0E7C66",
            display: "flex",
            fontSize: 30,
            fontWeight: 800,
            gap: 14,
            padding: "20px 26px",
          }}
        >
          <svg fill="none" height="32" stroke="#0E7C66" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" viewBox="0 0 24 24" width="32">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {fields.note}
        </div>
      ) : null}
    </div>
  );
}

type Screenshot = { height: number; src: string; width: number };

/** Captura de la carpeta capturas/ como data URI; null si no existe. */
async function loadScreenshot(file: string): Promise<Screenshot | null> {
  try {
    const data = await readFile(path.join(assetsDir, "capturas", file));
    const { height = 0, width = 0 } = await sharp(data).metadata();
    return width && height ? { height, src: `data:image/jpeg;base64,${data.toString("base64")}`, width } : null;
  } catch {
    return null;
  }
}

function PhoneVisual({
  displayWidth,
  screenshot,
  sticker,
  theme,
  tilt,
}: {
  displayWidth: number;
  screenshot: Screenshot;
  sticker: string;
  theme: ThemeColors;
  tilt: boolean;
}) {
  const displayHeight = Math.round((screenshot.height * displayWidth) / screenshot.width);

  return (
    <div style={{ display: "flex", flexShrink: 0, padding: "30px 60px 0", position: "relative" }}>
      <div
        style={{
          background: theme.bezel,
          borderRadius: 64,
          boxShadow: "0 40px 90px rgba(13,27,42,0.35)",
          display: "flex",
          padding: 16,
          ...(tilt ? { transform: "rotate(-4deg)" } : {}),
        }}
      >
        <div style={{ borderRadius: 50, display: "flex", height: displayHeight, overflow: "hidden", width: displayWidth }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" height={displayHeight} src={screenshot.src} width={displayWidth} />
        </div>
      </div>
      {sticker ? (
        <div
          style={{
            alignItems: "center",
            background: theme.sticker,
            border: "6px solid #FFFFFF",
            borderRadius: 999,
            boxShadow: "0 20px 40px rgba(13,27,42,0.3)",
            color: "#FFFFFF",
            display: "flex",
            fontSize: sticker.length > 8 ? 30 : 40,
            fontWeight: 800,
            height: 200,
            justifyContent: "center",
            lineHeight: 1.05,
            padding: 20,
            position: "absolute",
            right: 0,
            textAlign: "center",
            top: 0,
            transform: "rotate(10deg)",
            width: 200,
          }}
        >
          {sticker}
        </div>
      ) : null}
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
  const theme = THEMES[fields.theme];
  const side = fields.layout === "costado";
  const screenshot =
    fields.visual === "captura" && fields.captura ? await loadScreenshot(fields.captura.file) : null;
  let visual: React.ReactNode = null;

  if (fields.visual === "perfil" && fields.perfil) visual = <PerfilVisual fields={fields.perfil} />;
  if (fields.visual === "reservas" && fields.reservas) visual = <ReservasVisual fields={fields.reservas} />;
  if (fields.visual === "serie" && fields.serie) visual = <SerieVisual fields={fields.serie} />;
  if (fields.visual === "evolucion" && fields.evolucion) visual = <EvolucionVisual fields={fields.evolucion} />;
  if (fields.visual === "tarjeta" && fields.tarjeta) visual = <TarjetaVisual fields={fields.tarjeta} />;
  if (screenshot && fields.captura) {
    visual = (
      <PhoneVisual
        displayWidth={side ? 480 : 560}
        screenshot={screenshot}
        sticker={fields.captura.sticker}
        theme={theme}
        tilt={fields.captura.tilt}
      />
    );
  }

  const text = (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, width: side ? 430 : "100%" }}>
      {fields.eyebrow ? (
        <div style={{ color: theme.eyebrow, display: "flex", fontSize: side ? 26 : 30, fontWeight: 800, letterSpacing: 3 }}>
          {fields.eyebrow.toUpperCase()}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: side ? 74 : 96,
          fontWeight: 800,
          letterSpacing: side ? -2 : -3,
          lineHeight: 1.04,
          marginTop: 22,
        }}
      >
        <div style={{ display: "flex" }}>{fields.title}</div>
        {fields.highlight ? <div style={{ color: theme.highlight, display: "flex" }}>{fields.highlight}</div> : null}
      </div>
      {fields.subtitle ? (
        <div style={{ color: theme.muted, display: "flex", fontSize: side ? 34 : 38, lineHeight: 1.35, marginTop: 28, maxWidth: 860 }}>
          {fields.subtitle}
        </div>
      ) : null}
    </div>
  );

  const response = new ImageResponse(
    (
      <div
        style={{
          background: theme.background,
          color: theme.text,
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
            background: theme.blob,
            borderRadius: 999,
            display: "flex",
            height: 520,
            opacity: theme.blobOpacity,
            position: "absolute",
            right: -180,
            top: -160,
            width: 520,
          }}
        />
        {side ? (
          <div style={{ alignItems: "center", display: "flex", flex: 1, overflow: "hidden", padding: "0 0 0 88px" }}>
            {text}
            {/* El celular puede asomar cortado por el borde derecho. */}
            <div style={{ display: "flex", flexShrink: 0, marginLeft: -20 }}>{visual}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden", padding: "96px 88px 0" }}>
            {text}
            <div
              style={{
                alignItems: screenshot ? "flex-start" : "center",
                display: "flex",
                flex: 1,
                justifyContent: "center",
                marginTop: screenshot ? 20 : 0,
              }}
            >
              {visual}
            </div>
          </div>
        )}
        <div
          style={{
            alignItems: "center",
            background: theme.footer,
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
  return sharp(png).flatten({ background: theme.background }).jpeg({ mozjpeg: true, quality: 90 }).toBuffer();
}
