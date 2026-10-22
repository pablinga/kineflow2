import type { Metadata } from "next";
import { cache } from "react";
import { Logo } from "@/components/ui/Logo";
import { PublicProfileFooter } from "@/components/booking/PublicProfileFooter";
import { PublicProfileHeader } from "@/components/booking/PublicProfileHeader";
import { getPublicProfileView, getWorkspace } from "@/lib/public-booking";
import {
  buildProfileJsonLd,
  getProfileDescription,
  getProfileTitle,
  isProfileEmpty,
} from "@/lib/public-profile";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";
import { BookingClient } from "./BookingClient";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


/**
 * Perfil público del espacio. Si no se puede cargar (link inválido, base
 * caída) devuelve null y la página muestra solo la reserva, como antes.
 * cache() evita leerlo dos veces (metadatos y página).
 */
const loadProfile = cache(async (workspaceId: string) => {
  if (!UUID_PATTERN.test(workspaceId)) {
    return null;
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  try {
    const workspace = await getWorkspace(admin, workspaceId);

    return workspace
      ? await getPublicProfileView(admin, getSupabaseServerClient(), workspace)
      : null;
  } catch (error) {
    console.error("[public-profile] load failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { workspaceId } = await params;
  const profile = await loadProfile(workspaceId);

  if (!profile) {
    return { robots: { follow: false, index: false }, title: "Reservá tu turno | KineFlow" };
  }

  const title = getProfileTitle(profile);
  const description = getProfileDescription(profile);
  const url = `${getSiteUrl()}/reservar/${profile.workspaceId}`;

  return {
    alternates: { canonical: url },
    description,
    openGraph: {
      description,
      locale: "es_AR",
      siteName: "KineFlow",
      title,
      type: "profile",
      url,
    },
    // Un perfil sin bio ni tratamientos no se indexa (el link funciona igual).
    robots: isProfileEmpty(profile) ? { follow: true, index: false } : { follow: true, index: true },
    title,
    twitter: { card: "summary", description, title },
  };
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { workspaceId } = await params;
  const profile = await loadProfile(workspaceId);
  const jsonLd = profile
    ? JSON.stringify(
        buildProfileJsonLd(profile, `${getSiteUrl()}/reservar/${profile.workspaceId}`),
      ).replace(/</g, "\\u003c")
    : null;

  return (
    <main className="min-h-screen bg-ocean-50 px-4 py-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div className="px-1">
          <Logo />
        </div>
        {profile ? <PublicProfileHeader profile={profile} /> : null}
        <BookingClient workspaceId={workspaceId} />
        <PublicProfileFooter workspaceId={workspaceId} />
      </div>
      {jsonLd ? (
        <script
          dangerouslySetInnerHTML={{ __html: jsonLd }}
          type="application/ld+json"
        />
      ) : null}
    </main>
  );
}
