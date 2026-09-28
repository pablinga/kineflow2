import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Panel admin | KineFlow",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-ocean-50">{children}</div>;
}
