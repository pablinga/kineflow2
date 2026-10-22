import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  description: "Ingresá a tu cuenta de KineFlow.",
  title: "Ingresar",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
