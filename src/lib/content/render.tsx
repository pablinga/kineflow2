import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

// Piezas para redes con plantilla: next/og (Satori) arma el PNG y sharp lo
// convierte a JPEG, el único formato que acepta Instagram. Logo y tipografía
// (Inter, licencia OFL) salen de src/assets/social: no se descarga nada.

export const CONTENT_TEMPLATES = ["frase", "tip", "feature"] as const;
export type ContentTemplate = (typeof CONTENT_TEMPLATES)[number];

export const CONTENT_SIZES = {
  feed: { height: 1350, width: 1080 },
  square: { height: 1080, width: 1080 },
} as const;
export type ContentSize = keyof typeof CONTENT_SIZES;

/** Capturas de la app que ya están en el repo, para la plantilla "feature". */
export const FEATURE_SCREENSHOTS = {
  agenda: "public/images/landing/kineflow-screenshot-agenda.png",
  dashboard: "public/images/landing/kineflow-screenshot-dashboard.png",
  ingresos: "public/images/landing/kineflow-screenshot-ingresos.png",
} as const;
export type FeatureScreenshot = keyof typeof FEATURE_SCREENSHOTS;

export type TemplateFields = {
  number?: string;
  screenshot?: FeatureScreenshot | null;
  subtitle?: string;
  title: string;
};

const INK = "#0D1B2A";
const BRAND = "#1565FF";
const MUTED = "#3B4C61";
const BACKGROUND = "#F4F7FF";

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

async function loadScreenshot(name: FeatureScreenshot) {
  const file = await readFile(path.join(process.cwd(), FEATURE_SCREENSHOTS[name]));

  return `data:image/png;base64,${file.toString("base64")}`;
}

function Brand({ icon }: { icon: string }) {
  return (
    <div style={{ alignItems: "center", display: "flex", gap: 22 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img height={76} src={icon} width={76} alt="" />
      <span style={{ color: INK, fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>KineFlow</span>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between", width: "100%" }}>
      <span style={{ color: MUTED, fontSize: 32, fontWeight: 500 }}>kineflow.ar</span>
      <div style={{ background: BRAND, borderRadius: 999, display: "flex", height: 14, width: 140 }} />
    </div>
  );
}

function titleSize(title: string, size: ContentSize) {
  const base = size === "feed" ? 96 : 84;

  if (title.length > 70) return base - 26;
  if (title.length > 45) return base - 14;
  return base;
}

export async function renderTemplatePng(
  template: ContentTemplate,
  fields: TemplateFields,
  size: ContentSize,
) {
  const assets = await loadAssets();
  const { height, width } = CONTENT_SIZES[size];
  const screenshot =
    template === "feature" && fields.screenshot ? await loadScreenshot(fields.screenshot) : null;
  const title = fields.title.trim();
  const subtitle = fields.subtitle?.trim() ?? "";

  let body: React.ReactNode;

  if (template === "tip") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <div
          style={{
            alignItems: "center",
            background: BRAND,
            borderRadius: 40,
            color: "#FFFFFF",
            display: "flex",
            fontSize: 120,
            fontWeight: 800,
            height: 200,
            justifyContent: "center",
            width: 200,
          }}
        >
          {fields.number?.trim() || "1"}
        </div>
        <div style={{ color: INK, display: "flex", fontSize: titleSize(title, size), fontWeight: 800, letterSpacing: -2, lineHeight: 1.08 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ color: MUTED, display: "flex", fontSize: 42, fontWeight: 500, lineHeight: 1.35 }}>{subtitle}</div>
        ) : null}
      </div>
    );
  } else if (template === "feature") {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 36 }}>
        <div style={{ color: BRAND, display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4 }}>NUEVO EN KINEFLOW</div>
        <div style={{ color: INK, display: "flex", fontSize: titleSize(title, size) - (screenshot ? 22 : 8), fontWeight: 800, letterSpacing: -2, lineHeight: 1.08 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ color: MUTED, display: "flex", fontSize: screenshot ? 36 : 40, fontWeight: 500, lineHeight: 1.35 }}>{subtitle}</div>
        ) : null}
        {screenshot ? (
          <div
            style={{
              background: "#FFFFFF",
              border: "2px solid #DCE8FF",
              borderRadius: 28,
              display: "flex",
              height: size === "feed" ? 430 : 250,
              marginBottom: 28,
              overflow: "hidden",
              width: "100%",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" src={screenshot} style={{ objectFit: "cover", objectPosition: "top", width: "100%" }} />
          </div>
        ) : null}
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <div style={{ background: BRAND, borderRadius: 999, display: "flex", height: 12, width: 120 }} />
        <div style={{ color: INK, display: "flex", fontSize: titleSize(title, size) + 6, fontWeight: 800, letterSpacing: -2, lineHeight: 1.06 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ color: MUTED, display: "flex", fontSize: 46, fontWeight: 500, lineHeight: 1.35 }}>{subtitle}</div>
        ) : null}
      </div>
    );
  }

  const response = new ImageResponse(
    (
      <div
        style={{
          background: BACKGROUND,
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter",
          height: "100%",
          justifyContent: "space-between",
          padding: 96,
          width: "100%",
        }}
      >
        <Brand icon={assets.icon} />
        {body}
        <Footer />
      </div>
    ),
    {
      fonts: [
        { data: assets.medium, name: "Inter", style: "normal", weight: 500 },
        { data: assets.bold, name: "Inter", style: "normal", weight: 800 },
      ],
      height,
      width,
    },
  );

  return Buffer.from(await response.arrayBuffer());
}

/** JPEG listo para Instagram (sRGB, sin transparencia, < 8 MB). */
export async function renderTemplateJpeg(
  template: ContentTemplate,
  fields: TemplateFields,
  size: ContentSize,
) {
  const png = await renderTemplatePng(template, fields, size);

  return sharp(png).flatten({ background: BACKGROUND }).jpeg({ mozjpeg: true, quality: 90 }).toBuffer();
}
