import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
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
  };
}
