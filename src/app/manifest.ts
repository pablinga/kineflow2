import type { MetadataRoute } from "next";

const themeColor = "#0F55DC";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KineFlow",
    short_name: "KineFlow",
    description: "Gestión simple para kinesiólogos y clínicas",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: themeColor,
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
