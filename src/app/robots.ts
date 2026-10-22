import type { MetadataRoute } from "next";
import { getSiteUrl, isIndexableDeployment } from "@/lib/site-url";

// Abierto a todos los robots, incluidos los de IA (búsqueda y entrenamiento:
// decisión del usuario, 2026-10-22). QA/preview no se indexa.
export default function robots(): MetadataRoute.Robots {
  if (!isIndexableDeployment()) {
    return { rules: { disallow: "/", userAgent: "*" } };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/dashboard/",
        "/app/",
        "/billing/",
        "/invitacion/",
        "/nueva-password",
        "/recuperar-password",
        "/suscripcion",
        "/suscripcion-error",
        "/suscripcion-exitosa",
        "/suscripcion-pendiente",
      ],
    },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
