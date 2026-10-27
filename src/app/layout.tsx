import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AttributionCapture } from "@/components/analytics/AttributionCapture";
import { AndroidAppCapture } from "@/components/AndroidAppCapture";
import { PwaInstallCapture } from "@/components/PwaInstallCapture";
import { LANDING_DESCRIPTION, LANDING_TITLE } from "@/lib/landing-seo";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  // Base de las URLs relativas (canonical, Open Graph): dominio canónico.
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: LANDING_TITLE,
    template: "%s | KineFlow",
  },
  description: LANDING_DESCRIPTION,
  openGraph: {
    description: LANDING_DESCRIPTION,
    locale: "es_AR",
    siteName: "KineFlow",
    title: LANDING_TITLE,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    description: LANDING_DESCRIPTION,
    title: LANDING_TITLE,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KineFlow",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/kineflow-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#0F55DC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Analytics />
        <SpeedInsights />
        <AttributionCapture />
        <PwaInstallCapture />
        <AndroidAppCapture />
      </body>
    </html>
  );
}
