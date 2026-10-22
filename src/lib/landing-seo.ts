// Datos estructurados (schema.org) de la landing: la organización, la
// aplicación con sus planes y las preguntas frecuentes. Lógica pura.

export type LandingSeoPlan = { name: string; priceAmount: number | null };
export type LandingSeoFaq = { answer: string; question: string };

export const LANDING_TITLE = "KineFlow | Software para kinesiólogos y clínicas de rehabilitación";
export const LANDING_DESCRIPTION =
  "Agenda, reservas online, fichas de pacientes con evoluciones, cobros y recordatorios por WhatsApp para kinesiólogos y clínicas de rehabilitación. Probalo 3 meses gratis, sin tarjeta.";

export function buildLandingJsonLd(params: {
  contactEmail: string;
  description: string;
  faqs: LandingSeoFaq[];
  instagramUrl: string;
  plans: LandingSeoPlan[];
  siteUrl: string;
}) {
  const site = params.siteUrl.replace(/\/$/, "");
  const organizationId = `${site}/#organization`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@id": organizationId,
        "@type": "Organization",
        email: params.contactEmail,
        logo: `${site}/icon-512.png`,
        name: "KineFlow",
        sameAs: [params.instagramUrl],
        url: `${site}/`,
      },
      {
        "@type": "WebSite",
        inLanguage: "es-AR",
        name: "KineFlow",
        publisher: { "@id": organizationId },
        url: `${site}/`,
      },
      {
        "@type": "SoftwareApplication",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Gestión de consultorios de kinesiología",
        description: params.description,
        inLanguage: "es-AR",
        name: "KineFlow",
        offers: params.plans
          .filter((plan) => plan.priceAmount !== null)
          .map((plan) => ({
            "@type": "Offer",
            name: plan.name,
            price: String(plan.priceAmount),
            priceCurrency: "ARS",
          })),
        operatingSystem: "Web, Android, iOS",
        publisher: { "@id": organizationId },
        url: `${site}/`,
      },
      {
        "@type": "FAQPage",
        mainEntity: params.faqs.map((faq) => ({
          "@type": "Question",
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
          name: faq.question,
        })),
      },
    ],
  };
}

/** JSON para <script type="application/ld+json"> sin poder cerrar el tag. */
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
