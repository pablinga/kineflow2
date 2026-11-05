import type { MetadataRoute } from "next";

const themeColor = "#0F55DC";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // id y scope fijos: la app de Android (android/twa-manifest.json) depende
    // de ellos; cambiarlos crea otra app instalada.
    id: "/dashboard",
    name: "KineFlow",
    short_name: "KineFlow",
    description: "Software para profesionales y clínicas de rehabilitación",
    start_url: "/dashboard",
    scope: "/",
    lang: "es-AR",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
    categories: ["medical", "productivity"],
    // Capturas de la demo pública (datos ficticios): Chrome las muestra en el
    // diálogo de instalación ampliado. narrow = celular, wide = escritorio.
    screenshots: [
      {
        src: "/screenshots/narrow-agenda.webp",
        sizes: "1080x1920",
        type: "image/webp",
        form_factor: "narrow",
        label: "Agenda del día con asistencia y cobros",
      },
      {
        src: "/screenshots/narrow-pacientes.webp",
        sizes: "1080x1920",
        type: "image/webp",
        form_factor: "narrow",
        label: "Pacientes con última sesión y próximo turno",
      },
      {
        src: "/screenshots/wide-agenda.webp",
        sizes: "1920x1200",
        type: "image/webp",
        form_factor: "wide",
        label: "Agenda del día en la computadora",
      },
    ],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
