import type { MetadataRoute } from "next";
import { PUBLIC_STATIC_PAGES } from "@/lib/public-pages";
import { listIndexableProfiles } from "@/lib/public-directory";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// Páginas públicas indexables y perfiles con contenido (los vacíos tienen
// noindex y no van). Se regenera cada hora.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const entries: MetadataRoute.Sitemap = PUBLIC_STATIC_PAGES.map((page) => ({
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
