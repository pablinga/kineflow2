import assert from "node:assert/strict";
import {
  isAcquisitionEventType,
  isAttributionExpired,
  isVisitorId,
  parseAttributionFromSearch,
  resolveFirstTouch,
  sanitizeAttribution,
  sanitizeLandingPage,
  sanitizeReferrer,
  sanitizeUtmValue,
} from "../src/lib/attribution.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const CAMPAIGN_URL =
  "?utm_source=email&utm_medium=outreach&utm_campaign=clinicas_octubre_2026&utm_content=clinica_abc";
const day = 24 * 60 * 60 * 1000;

test("ingreso con UTM: captura source, medium, campaign y content", () => {
  const attribution = parseAttributionFromSearch({
    landingPage: "/",
    now: new Date("2026-10-04T12:00:00Z"),
    referrer: "https://mail.google.com/mail/u/0/#inbox",
    search: CAMPAIGN_URL,
  });

  assert.deepEqual(attribution, {
    first_visited_at: "2026-10-04T12:00:00.000Z",
    landing_page: "/",
    referrer: "https://mail.google.com",
    utm_campaign: "clinicas_octubre_2026",
    utm_content: "clinica_abc",
    utm_medium: "outreach",
    utm_source: "email",
    utm_term: null,
  });
});

test("sin utm_source no hay atribución (visita normal)", () => {
  assert.equal(parseAttributionFromSearch({ landingPage: "/", search: "" }), null);
  assert.equal(
    parseAttributionFromSearch({ landingPage: "/", search: "?utm_campaign=x" }),
    null,
  );
});

test("utm_content se guarda normalizado (slug en minúsculas)", () => {
  const attribution = parseAttributionFromSearch({
    landingPage: "/",
    search: "?utm_source=Email&utm_content=Centro-XYZ_01",
  });
  assert.equal(attribution.utm_source, "email");
  assert.equal(attribution.utm_content, "centro-xyz_01");
});

test("privacidad: emails, espacios y caracteres raros se descartan", () => {
  assert.equal(sanitizeUtmValue("juan@clinica.com"), null);
  assert.equal(sanitizeUtmValue("Juan Pérez"), null);
  assert.equal(sanitizeUtmValue("<script>"), null);
  assert.equal(sanitizeUtmValue("a".repeat(101)), null);
  const attribution = parseAttributionFromSearch({
    landingPage: "/",
    search: "?utm_source=email&utm_content=juan%40clinica.com",
  });
  assert.equal(attribution.utm_content, null);
});

test("parámetros malformados no rompen (y no inventan atribución)", () => {
  for (const search of ["?utm_source=%E0%A4%A", "?utm_source=", "?&&==", "?utm_source[]=x", "%%%"]) {
    assert.doesNotThrow(() => parseAttributionFromSearch({ landingPage: "/", search }));
  }
  assert.equal(sanitizeAttribution("no es un objeto"), null);
  assert.equal(sanitizeAttribution({ utm_source: 123 }), null);
  assert.equal(sanitizeAttribution(null), null);
});

test("landing sin query/hash y referrer solo con origen", () => {
  assert.equal(sanitizeLandingPage("/registro?email=x@y.com#a"), "/registro");
  assert.equal(sanitizeLandingPage("https://otro.com/"), "/");
  assert.equal(sanitizeReferrer("https://www.google.com/search?q=kine"), "https://www.google.com");
  assert.equal(sanitizeReferrer("javascript:alert(1)"), null);
  assert.equal(sanitizeReferrer("https://kineflow.ar/planes", "kineflow.ar"), null);
});

test("persistencia: una visita posterior sin UTM no borra el first touch", () => {
  const first = parseAttributionFromSearch({
    landingPage: "/",
    now: new Date("2026-10-04T12:00:00Z"),
    search: CAMPAIGN_URL,
  });
  const laterVisit = parseAttributionFromSearch({ landingPage: "/planes", search: "" });
  assert.equal(resolveFirstTouch(first, laterVisit, new Date("2026-10-10T12:00:00Z")), first);
});

test("first touch: otra campaña posterior no reemplaza la original", () => {
  const first = parseAttributionFromSearch({
    landingPage: "/",
    now: new Date("2026-10-04T12:00:00Z"),
    search: CAMPAIGN_URL,
  });
  const other = parseAttributionFromSearch({
    landingPage: "/",
    search: "?utm_source=google&utm_campaign=otra",
  });
  assert.equal(
    resolveFirstTouch(first, other, new Date("2026-10-05T12:00:00Z")).utm_campaign,
    "clinicas_octubre_2026",
  );
});

test("vence a los 90 días: recién ahí una campaña nueva la reemplaza", () => {
  const first = parseAttributionFromSearch({
    landingPage: "/",
    now: new Date("2026-01-01T00:00:00Z"),
    search: CAMPAIGN_URL,
  });
  const later = new Date(Date.parse("2026-01-01T00:00:00Z") + 91 * day);
  assert.equal(isAttributionExpired(first, later), true);
  const other = parseAttributionFromSearch({
    landingPage: "/",
    now: later,
    search: "?utm_source=google",
  });
  assert.equal(resolveFirstTouch(first, other, later).utm_source, "google");
  assert.equal(resolveFirstTouch(first, null, later), null);
});

test("sanitizeAttribution conserva una atribución guardada válida", () => {
  const first = parseAttributionFromSearch({ landingPage: "/", search: CAMPAIGN_URL });
  assert.deepEqual(sanitizeAttribution(JSON.parse(JSON.stringify(first))), first);
});

test("validación de eventos y visitor id", () => {
  assert.equal(isAcquisitionEventType("landing_view"), true);
  assert.equal(isAcquisitionEventType("signup_started"), true);
  assert.equal(isAcquisitionEventType("signup_completed"), false);
  assert.equal(isVisitorId("3f2b8c1e-9d4a-4b6e-8f2a-1c3d5e7f9a0b"), true);
  assert.equal(isVisitorId("no-es-uuid"), false);
});

console.log("ok - attribution: first touch, saneamiento y privacidad cubiertos.");
