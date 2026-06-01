import { LegalPage } from "@/components/layout/LegalPage";
import {
  termsIntro,
  termsLastUpdated,
  termsSections,
} from "@/lib/legal/terms";

export default function TermsPage() {
  return (
    <LegalPage
      intro={termsIntro}
      sections={termsSections}
      title="Terminos y Condiciones"
      updatedAt={termsLastUpdated}
    />
  );
}
