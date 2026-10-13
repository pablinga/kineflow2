import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  // El publicador de contenido lee la tipografía, el logo y las capturas con
  // fs al generar las imágenes: hay que incluirlos en las funciones.
  outputFileTracingIncludes: {
    "/api/admin/content": ["./src/assets/social/**", "./public/images/landing/**"],
    "/api/admin/content/drafts": ["./src/assets/social/**", "./public/images/landing/**"],
    "/api/admin/content/preview": ["./src/assets/social/**", "./public/images/landing/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
