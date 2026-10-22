import assert from "node:assert/strict";
import {
  buildProfileEventAttribution,
  isAcquisitionEventType,
  isValidProfileEventAttribution,
} from "../src/lib/attribution.ts";
import {
  EMPTY_PROFILE_FIELDS,
  buildProfileJsonLd,
  getProfileDescription,
  getProfileDisplayName,
  getLocalityText,
  getProfileFooterUrl,
  getProfileShareCard,
  getProfileTitle,
  isProfileEmpty,
  normalizeProfileFields,
  normalizeTreatments,
} from "../src/lib/public-profile.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const ROSARIO = { displayName: "Rosario", name: "Rosario", province: "Santa Fe" };
const CABA = { displayName: "CABA", name: "Ciudad Autónoma de Buenos Aires", province: "Ciudad Autónoma de Buenos Aires" };

const base = {
  ...EMPTY_PROFILE_FIELDS,
  insuranceProviders: [],
  locality: null,
  name: "Juan Pérez",
  type: "PERSONAL",
  workspaceId: "3f2a9c1e-1111-4222-8333-444455556666",
};

test("título con Lic. y ciudad, sin ciudad y para clínicas", () => {
  assert.equal(getProfileTitle({ ...base, locality: ROSARIO }), "Lic. Juan Pérez — Kinesiología en Rosario");
  assert.equal(getProfileTitle(base), "Lic. Juan Pérez — Kinesiología");
  assert.equal(getProfileDisplayName({ ...base, name: "Lic. Ana Gómez" }), "Lic. Ana Gómez");
  assert.equal(getProfileDisplayName({ ...base, name: "Licenciada Ana Gómez" }), "Licenciada Ana Gómez");
  assert.equal(
    getProfileTitle({ ...base, locality: CABA, name: "Centro Kine Sur", type: "CLINICA" }),
    "Centro Kine Sur — Kinesiología en CABA",
  );
});

test("tratamientos: solo la lista cerrada, sin repetidos y en orden", () => {
  assert.deepEqual(normalizeTreatments(["atm", "magia", "rpg", "atm"]), ["rpg", "atm"]);
  assert.deepEqual(normalizeTreatments("rpg"), []);
});

test("normaliza y recorta los campos", () => {
  const fields = normalizeProfileFields({
    bio: ` ${"a".repeat(500)} `,
    localityId: " 82084270 ",
    homeVisits: "true",
    treatments: ["deportiva"],
  });
  assert.equal(fields.bio.length, 400);
  assert.equal(fields.localityId, "82084270");
  assert.equal(normalizeProfileFields({ localityId: "Rosario" }).localityId, "");
  assert.equal(fields.homeVisits, false);
  assert.equal(fields.licenseNumber, "");
});

test("perfil vacío sin bio ni tratamientos", () => {
  assert.equal(isProfileEmpty(EMPTY_PROFILE_FIELDS), true);
  assert.equal(isProfileEmpty({ bio: "  ", treatments: [] }), true);
  assert.equal(isProfileEmpty({ bio: "", treatments: ["rpg"] }), false);
  assert.equal(isProfileEmpty({ bio: "Hola", treatments: [] }), false);
});

test("descripción: bio recortada o resumen armado", () => {
  assert.equal(getProfileDescription({ ...base, bio: "Kine deportivo." }), "Kine deportivo.");
  assert.ok(getProfileDescription({ ...base, bio: "x".repeat(300) }).length <= 160);
  assert.equal(
    getProfileDescription({ ...base, locality: ROSARIO, homeVisits: true, treatments: ["rpg", "atm", "deportiva"] }),
    "Kinesiología: RPG, ATM y deportiva en Rosario con atención a domicilio. Reservá tu turno online.",
  );
  assert.equal(getProfileDescription(base), "Kinesiología. Reservá tu turno online.");
});

test("JSON-LD: Physician para particulares y MedicalClinic para clínicas", () => {
  const url = "https://kineflow.ar/reservar/x";
  const personal = buildProfileJsonLd(
    { ...base, licenseNumber: "MP 1", locality: ROSARIO, publicAddress: "Corrientes 123", treatments: ["rpg"] },
    url,
  );
  assert.equal(personal["@type"], "Physician");
  assert.equal(personal.name, "Lic. Juan Pérez");
  assert.equal(personal.address.addressLocality, "Rosario");
  assert.equal(personal.address.addressRegion, "Santa Fe");
  assert.equal(personal.identifier, "MP 1");
  assert.deepEqual(personal.availableService, [{ "@type": "MedicalTherapy", name: "RPG" }]);

  const clinic = buildProfileJsonLd({ ...base, licenseNumber: "MP 1", name: "Centro", type: "CLINICA" }, url);
  assert.equal(clinic["@type"], "MedicalClinic");
  assert.equal(clinic.identifier, undefined);
  assert.equal(clinic.address, undefined);
  assert.equal(clinic.description, undefined);
});

test("link del pie con la campaña exacta", () => {
  const url = new URL(getProfileFooterUrl("https://kineflow.ar/"));
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("utm_source"), "perfil");
  assert.equal(url.searchParams.get("utm_medium"), "footer");
  assert.equal(url.searchParams.get("utm_campaign"), "perfil_publico");
  assert.equal(getProfileFooterUrl(), "/?utm_campaign=perfil_publico&utm_medium=footer&utm_source=perfil");
});

test("eventos del perfil con su propia atribución", () => {
  assert.equal(isAcquisitionEventType("profile_view"), true);
  assert.equal(isAcquisitionEventType("profile_footer_click"), true);
  const view = buildProfileEventAttribution({
    eventType: "profile_view",
    landingPage: "/reservar/3F2A9C1E-1111-4222-8333-444455556666?src=qr",
    workspaceId: "3F2A9C1E-1111-4222-8333-444455556666",
  });
  assert.equal(view.utm_source, "perfil");
  assert.equal(view.utm_medium, "view");
  assert.equal(view.utm_campaign, "perfil_publico");
  assert.equal(view.utm_content, "3f2a9c1e-1111-4222-8333-444455556666");
  assert.equal(view.landing_page, "/reservar/3F2A9C1E-1111-4222-8333-444455556666");
  assert.equal(isValidProfileEventAttribution(view), true);
  assert.equal(
    buildProfileEventAttribution({ eventType: "profile_footer_click", landingPage: "/reservar/x", workspaceId: "x" }).utm_medium,
    "footer",
  );
  assert.equal(
    isValidProfileEventAttribution({ ...view, landing_page: "/" }),
    false,
  );
  assert.equal(
    buildProfileEventAttribution({ eventType: "profile_view", landingPage: "/reservar/x", workspaceId: "a@b" }),
    null,
  );
});

test("texto de la localidad para mostrar", () => {
  assert.equal(getLocalityText(ROSARIO), "Rosario, Santa Fe");
  assert.equal(getLocalityText(CABA), "Ciudad Autónoma de Buenos Aires");
  assert.equal(getLocalityText({ displayName: "Córdoba", name: "Córdoba", province: "Córdoba" }), "Córdoba");
  assert.equal(getLocalityText(null), "");
});

test("tarjeta para compartir: nombre, localidad y hasta 4 tratamientos", () => {
  const card = getProfileShareCard({
    ...base,
    homeVisits: true,
    locality: ROSARIO,
    treatments: ["rpg", "deportiva", "respiratoria", "piso_pelvico", "atm", "neurologica"],
  });
  assert.equal(card.name, "Lic. Juan Pérez");
  assert.equal(card.eyebrow, "Kinesiología");
  assert.equal(card.locality, "Rosario, Santa Fe");
  assert.deepEqual(card.treatments, ["RPG", "Deportiva", "Respiratoria", "Piso pélvico", "+2"]);
  assert.equal(card.homeVisits, true);

  const clinic = getProfileShareCard({ ...base, name: "C".repeat(80), type: "CLINICA" });
  assert.equal(clinic.eyebrow, "Centro de kinesiología");
  assert.equal(clinic.name.length, 48);
  assert.ok(clinic.name.endsWith("…"));
  assert.deepEqual(clinic.treatments, []);
  assert.equal(clinic.locality, "");
});
