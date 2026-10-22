import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getProfileShareCard } from "@/lib/public-profile";
import { loadProfile } from "./load-profile";

// Imagen al compartir el link de reservas de un profesional o una clínica
// (WhatsApp, Instagram, buscadores): nombre, localidad, tratamientos y la
// marca KineFlow. Solo datos que la página ya muestra; nunca la bio.
export const alt = "Perfil profesional y turnos online en KineFlow";
export const size = { height: 630, width: 1200 };
export const contentType = "image/png";
export const revalidate = 3600;

const assetsDir = path.join(process.cwd(), "src/assets/social");

type ImageProps = { params: Promise<{ workspaceId: string }> };

export default async function ProfileOpengraphImage({ params }: ImageProps) {
  const { workspaceId } = await params;
  const [profile, bold, medium, icon] = await Promise.all([
    loadProfile(workspaceId),
    readFile(path.join(assetsDir, "inter-latin-800-normal.woff")),
    readFile(path.join(assetsDir, "inter-latin-500-normal.woff")),
    readFile(path.join(assetsDir, "kineflow-icon.svg")),
  ]);
  const iconSrc = `data:image/svg+xml;base64,${icon.toString("base64")}`;
  const card = profile ? getProfileShareCard(profile) : null;
  const chips = card
    ? [...card.treatments, ...(card.homeVisits ? ["A domicilio"] : [])]
    : [];

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
          padding: "64px 80px",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <span style={{ color: "#0F55DC", fontSize: 30, fontWeight: 800 }}>
            {card?.eyebrow ?? "Kinesiología"}
          </span>
          <span
            style={{
              color: "#0D1B2A",
              fontSize: card && card.name.length > 28 ? 60 : 76,
              fontWeight: 800,
              lineHeight: 1.05,
            }}
          >
            {card?.name ?? "Reservá tu turno online"}
          </span>
          {card?.locality ? (
            <span style={{ color: "#475569", fontSize: 34, fontWeight: 500 }}>
              {card.locality}
            </span>
          ) : null}
          {chips.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
              {chips.map((chip) => (
                <span
                  key={chip}
                  style={{
                    background: "#E6F0FF",
                    borderRadius: 999,
                    color: "#0B43AE",
                    fontSize: 28,
                    fontWeight: 800,
                    padding: "10px 24px",
                  }}
                >
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ alignItems: "center", display: "flex", justifyContent: "space-between" }}>
          <span
            style={{
              background: "#1565FF",
              borderRadius: 999,
              color: "#FFFFFF",
              fontSize: 32,
              fontWeight: 800,
              padding: "16px 36px",
            }}
          >
            Reservá tu turno online
          </span>
          <div style={{ alignItems: "center", display: "flex", gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" height={56} src={iconSrc} width={56} />
            <span style={{ color: "#0D1B2A", fontSize: 34, fontWeight: 800 }}>KineFlow</span>
          </div>
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
