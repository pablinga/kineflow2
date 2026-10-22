import type { Metadata } from "next";
import { Logo } from "@/components/ui/Logo";
import { PublicProfileFooter } from "@/components/booking/PublicProfileFooter";
import { PublicProfileHeader } from "@/components/booking/PublicProfileHeader";
import {
  buildProfileJsonLd,
  getProfileDescription,
  getProfileTitle,
  isProfileEmpty,
} from "@/lib/public-profile";
import { getSiteUrl } from "@/lib/site-url";
import { BookingClient } from "./BookingClient";
import { loadProfile } from "./load-profile";

type PageProps = {
  params: Promise<{ workspaceId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { workspaceId } = await params;
  const profile = await loadProfile(workspaceId);

  if (!profile) {
    return { robots: { follow: false, index: false }, title: { absolute: "Reservá tu turno | KineFlow" } };
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
    title: { absolute: title },
    twitter: { card: "summary_large_image", description, title },
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
