import { buildLlmsTxt } from "@/lib/llms-txt";
import {
  LANDING_CONTACT_EMAIL,
  LANDING_FAQ,
  LANDING_FEATURES,
  LANDING_INSTAGRAM_URL,
  LANDING_WHATSAPP_BENEFITS,
} from "@/lib/landing-content";
import { getVisiblePlansForMvp } from "@/lib/plans";
import { listDirectoryProfiles } from "@/lib/public-directory";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

// /llms.txt (llmstxt.org): resumen del sitio para asistentes de IA, con los
// mismos textos que la landing y los perfiles que aceptaron aparecer en el
// buscador de KineFlow. Se regenera cada hora.
export const revalidate = 3600;

export async function GET() {
  const siteUrl = getSiteUrl();
  const admin = getSupabaseAdminClient();
  let profiles: Awaited<ReturnType<typeof listDirectoryProfiles>> = [];

  if (admin) {
    try {
      profiles = await listDirectoryProfiles(admin, siteUrl);
    } catch (error) {
      // Sin directorio el resto del archivo sigue sirviendo.
      console.error("[llms.txt] directory failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  const body = buildLlmsTxt({
    contactEmail: LANDING_CONTACT_EMAIL,
    faqs: LANDING_FAQ,
    features: LANDING_FEATURES.map(({ text, title }) => ({ text, title })),
    instagramUrl: LANDING_INSTAGRAM_URL,
    plans: getVisiblePlansForMvp().map(({ audience, features, limit, name, price }) => ({
      audience,
      features,
      limit,
      name,
      price,
    })),
    profiles,
    siteUrl,
    whatsappBenefits: LANDING_WHATSAPP_BENEFITS.map(({ text, title }) => ({ text, title })),
  });

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
