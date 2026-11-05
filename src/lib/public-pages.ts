/**
 * Páginas públicas fijas e indexables del sitio (sitemap.xml). Lógica pura,
 * separada de src/app/sitemap.ts para poder testearla sin Supabase.
 */
export const PUBLIC_STATIC_PAGES: ReadonlyArray<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/registro", priority: 0.8 },
  { path: "/demo", priority: 0.7 },
  { path: "/instalar", priority: 0.6 },
  { path: "/terminos-y-condiciones", priority: 0.3 },
  { path: "/politica-de-privacidad", priority: 0.3 },
  { path: "/suscripciones-cancelaciones-y-reembolsos", priority: 0.3 },
  { path: "/arrepentimiento", priority: 0.2 },
];
