import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/registro" },
  description:
    "Creá tu cuenta de KineFlow y probalo 3 meses gratis, sin tarjeta: agenda, reservas online, pacientes y cobros para kinesiólogos y clínicas.",
  title: "Crear cuenta",
};

export default function RegistroLayout({ children }: { children: ReactNode }) {
  return children;
}
