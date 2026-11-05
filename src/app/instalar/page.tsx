import type { Metadata } from "next";
import { InstallGuide } from "./InstallGuide";

export const metadata: Metadata = {
  alternates: { canonical: "/instalar" },
  description:
    "Cómo instalar KineFlow en Android o iPhone desde el navegador, sin tienda de apps. Paso a paso.",
  title: "Instalá KineFlow en tu celular",
};

/** Guía pública de instalación de la PWA (sin login). */
export default function InstallPage() {
  return <InstallGuide />;
}
