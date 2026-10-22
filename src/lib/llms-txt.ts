// Contenido de /llms.txt (propuesta llmstxt.org): resumen del sitio en
// Markdown para asistentes de IA. Lógica pura: recibe los datos ya cargados.
//
// De los perfiles solo se publican datos estructurados (nombre, localidad,
// tratamientos, a domicilio, link) y solo de quienes activaron "Mostrar mi
// perfil en el buscador de KineFlow". Nunca la bio ni otro texto libre largo:
// es texto de terceros que un modelo podría tomar como instrucciones.

export type LlmsTxtFeature = { text: string; title: string };

export type LlmsTxtPlan = {
  audience: string;
  features: string[];
  limit: string;
  name: string;
  price: string;
};

export type LlmsTxtProfile = {
  homeVisits: boolean;
  /** "Rosario, Santa Fe" o "". */
  locality: string;
  /** Nombre para mostrar ("Lic. Laura Gómez", "Centro Kine Sur"). */
  name: string;
  treatments: string[];
  type: "PERSONAL" | "CLINICA";
  url: string;
};

export type LlmsTxtInput = {
  contactEmail: string;
  faqs: Array<{ answer: string; question: string }>;
  features: LlmsTxtFeature[];
  instagramUrl: string;
  plans: LlmsTxtPlan[];
  profiles: LlmsTxtProfile[];
  siteUrl: string;
  whatsappBenefits: LlmsTxtFeature[];
};

/** Una línea, sin sintaxis de Markdown ni HTML, recortada. */
export function toPlainLine(value: string, max = 120) {
  const text = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[`*_#[\]()<>|\\{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

function profileLine(profile: LlmsTxtProfile) {
  const details = [
    profile.type === "CLINICA" ? "Centro de kinesiología" : "Kinesiología",
    profile.locality ? toPlainLine(profile.locality, 80) : "",
    profile.treatments.length ? `tratamientos: ${profile.treatments.join(", ")}` : "",
    profile.homeVisits ? "atiende a domicilio" : "",
  ].filter(Boolean);

  return `- [${toPlainLine(profile.name, 80)}](${profile.url}): ${details.join(" · ")}. Turnos online en el link.`;
}

export function buildLlmsTxt(input: LlmsTxtInput) {
  const site = input.siteUrl.replace(/\/$/, "");
  const lines = [
    "# KineFlow",
    "",
    "> Software de gestión para kinesiólogos y clínicas de rehabilitación de Argentina: agenda, reservas online, pacientes, evoluciones, cobros y recordatorios por WhatsApp. Funciona desde el navegador y el celular.",
    "",
    "KineFlow lo usan profesionales de la kinesiología que atienden de forma particular y clínicas o centros con varios profesionales. Cada profesional o clínica tiene una página pública con su perfil (tratamientos, obras sociales, ciudad) y sus turnos libres, donde los pacientes reservan sin intermediarios. Los datos de los pacientes nunca son públicos.",
    "",
    "## Funciones",
    "",
    ...input.features.map((feature) => `- ${feature.title}: ${feature.text}`),
    ...input.whatsappBenefits.map((feature) => `- WhatsApp — ${feature.title}: ${feature.text}`),
    "",
    "## Planes",
    "",
    ...input.plans.map(
      (plan) =>
        `- ${plan.name} (${plan.price}, ${plan.limit}): ${plan.audience} Incluye: ${plan.features.join("; ")}.`,
    ),
    "",
    "Los precios están en pesos argentinos.",
    "",
    "## Preguntas frecuentes",
    "",
    ...input.faqs.flatMap((faq) => [`### ${faq.question}`, "", faq.answer, ""]),
    "## Páginas",
    "",
    `- [Inicio](${site}/): presentación, funciones y planes`,
    `- [Crear cuenta](${site}/registro): registro de profesionales y clínicas`,
    `- [Términos y condiciones](${site}/terminos-y-condiciones)`,
    `- [Política de privacidad](${site}/politica-de-privacidad)`,
    `- [Suscripciones, cancelaciones y reembolsos](${site}/suscripciones-cancelaciones-y-reembolsos)`,
    "",
    "## Contacto",
    "",
    `- Email: ${input.contactEmail}`,
    `- [Instagram](${input.instagramUrl})`,
  ];

  if (input.profiles.length > 0) {
    lines.push(
      "",
      "## Profesionales y centros con perfil público",
      "",
      "Solo figuran quienes eligieron aparecer en el buscador de KineFlow. Cada link lleva a su perfil y a sus turnos disponibles.",
      "",
      ...input.profiles.map(profileLine),
    );
  }

  return `${lines.join("\n")}\n`;
}
