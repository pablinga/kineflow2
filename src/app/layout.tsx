import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AuthSessionProvider } from "@/contexts/AuthSessionContext";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaServiceWorkerRegistration } from "@/components/PwaServiceWorkerRegistration";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "KineFlow | Gestión simple para kinesiólogos",
  description:
    "App para kinesiólogos independientes: pacientes, turnos, sesiones, evolución y cobros en un solo lugar.",
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
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <PwaServiceWorkerRegistration />
        <PwaInstallPrompt />
        <Analytics />
      </body>
    </html>
  );
}
