import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

// Imagen al compartir kineflow.ar (WhatsApp, Instagram, LinkedIn, buscadores).
// Se genera en el build, con la tipografía y el logo del publicador de redes.
export const alt = "KineFlow: software para kinesiólogos y clínicas de rehabilitación";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";

const assetsDir = path.join(process.cwd(), "src/assets/social");

export default async function OpengraphImage() {
  const [bold, medium, icon] = await Promise.all([
    readFile(path.join(assetsDir, "inter-latin-800-normal.woff")),
    readFile(path.join(assetsDir, "inter-latin-500-normal.woff")),
    readFile(path.join(assetsDir, "kineflow-icon.svg")),
  ]);
  const iconSrc = `data:image/svg+xml;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #FFFFFF 0%, #EEF4FF 100%)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Inter",
          height: "100%",
          justifyContent: "space-between",
          padding: "72px 80px",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" height={88} src={iconSrc} width={88} />
          <span style={{ color: "#0D1B2A", fontSize: 52, fontWeight: 800 }}>KineFlow</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ color: "#0D1B2A", fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>
            Software para kinesiólogos y clínicas de rehabilitación
          </span>
          <span style={{ color: "#475569", fontSize: 32, fontWeight: 500 }}>
            Agenda · Reservas online · Pacientes · Cobros · WhatsApp
          </span>
        </div>
        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              background: "#1565FF",
              borderRadius: 999,
              color: "#FFFFFF",
              fontSize: 30,
              fontWeight: 800,
              padding: "14px 32px",
            }}
          >
            Probalo 3 meses gratis
          </span>
          <span style={{ color: "#0F55DC", fontSize: 32, fontWeight: 800 }}>kineflow.ar</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { data: bold, name: "Inter", style: "normal", weight: 800 },
        { data: medium, name: "Inter", style: "normal", weight: 500 },
      ],
    },
  );
}
