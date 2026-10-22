import assert from "node:assert/strict";
import { buildLandingJsonLd, serializeJsonLd } from "../src/lib/landing-seo.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const jsonLd = buildLandingJsonLd({
  contactEmail: "contacto@kineflow.ar",
  description: "Software para kinesiólogos.",
  faqs: [{ answer: "No.", question: "¿Necesito tarjeta?" }],
  instagramUrl: "https://www.instagram.com/kineflow.ar/",
  plans: [
    { name: "Prueba gratuita", priceAmount: 0 },
    { name: "KineFlow - Particular", priceAmount: 20000 },
    { name: "Sin precio", priceAmount: null },
  ],
  siteUrl: "https://www.kineflow.ar/",
});
const byType = Object.fromEntries(jsonLd["@graph"].map((node) => [node["@type"], node]));

test("organización, sitio, aplicación y preguntas en un solo grafo", () => {
  assert.deepEqual(Object.keys(byType).sort(), ["FAQPage", "Organization", "SoftwareApplication", "WebSite"]);
  assert.equal(byType.Organization.url, "https://www.kineflow.ar/");
  assert.equal(byType.Organization.logo, "https://www.kineflow.ar/icon-512.png");
  assert.deepEqual(byType.SoftwareApplication.publisher, { "@id": "https://www.kineflow.ar/#organization" });
});

test("ofertas en pesos, sin los planes sin precio", () => {
  assert.deepEqual(byType.SoftwareApplication.offers, [
    { "@type": "Offer", name: "Prueba gratuita", price: "0", priceCurrency: "ARS" },
    { "@type": "Offer", name: "KineFlow - Particular", price: "20000", priceCurrency: "ARS" },
  ]);
});

test("preguntas frecuentes", () => {
  assert.deepEqual(byType.FAQPage.mainEntity, [
    { "@type": "Question", acceptedAnswer: { "@type": "Answer", text: "No." }, name: "¿Necesito tarjeta?" },
  ]);
});

test("el JSON no puede cerrar el script", () => {
  assert.equal(serializeJsonLd({ a: "</script><b>" }), '{"a":"\\u003c/script>\\u003cb>"}');
});
