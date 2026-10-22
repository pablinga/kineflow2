import type { Metadata } from "next";
import { LegalPage } from "@/components/layout/LegalPage";
import {
  termsIntro,
  termsLastUpdated,
  termsSections,
} from "@/lib/legal/terms";

export const metadata: Metadata = {
  alternates: { canonical: "/terminos-y-condiciones" },
  description: "Términos y condiciones de uso de KineFlow, el software de gestión para kinesiólogos y clínicas de rehabilitación.",
  title: "Términos y condiciones",
};

export default function TermsPage() {
  return (
    <LegalPage
      intro={termsIntro}
      sections={termsSections}
      title="Términos y Condiciones"
      updatedAt={termsLastUpdated}
    />
  );
}
