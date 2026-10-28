import type { MetadataRoute } from "next";
import { listIndexableProfiles } from "@/lib/public-directory";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Páginas públicas indexables y perfiles con contenido (los vacíos tienen
// noindex y no van). Se regenera cada hora.
export const revalidate = 3600;

const STATIC_PAGES: Array<{ path: string; priority: number }> = [
  { path: "/", priority: 1 },
  { path: "/registro", priority: 0.8 },
  { path: "/demo", priority: 0.7 },
  { path: "/terminos-y-condiciones", priority: 0.3 },
  { path: "/politica-de-privacidad", priority: 0.3 },
  { path: "/suscripciones-cancelaciones-y-reembolsos", priority: 0.3 },
  { path: "/arrepentimiento", priority: 0.2 },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const entries: MetadataRoute.Sitemap = STATIC_PAGES.map((page) => ({
    changeFrequency: page.path === "/" ? "weekly" : "monthly",
    priority: page.priority,
    url: `${siteUrl}${page.path === "/" ? "" : page.path}`,
  }));
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return entries;
  }

  try {
    const profiles = await listIndexableProfiles(admin);

    return [
      ...entries,
      ...profiles.map((profile) => ({
        changeFrequency: "weekly" as const,
        lastModified: new Date(profile.updatedAt),
        priority: 0.6,
        url: `${siteUrl}/reservar/${profile.workspaceId}`,
      })),
    ];
  } catch (error) {
    console.error("[sitemap] profiles failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return entries;
  }
}
