import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  alternates: { canonical: null },
  robots: { follow: false, index: false },
  title: { absolute: "Revisá tu correo | KineFlow" },
};

export default function ConfirmSignupLayout({ children }: { children: ReactNode }) {
  return children;
}
