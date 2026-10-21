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
  getProfileFooterUrl,
  getProfileTitle,
  isProfileEmpty,
  normalizeProfileFields,
  normalizeTreatments,
} from "../src/lib/public-profile.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const base = {
  ...EMPTY_PROFILE_FIELDS,
  insuranceProviders: [],
  name: "Juan Pérez",
  type: "PERSONAL",
  workspaceId: "3f2a9c1e-1111-4222-8333-444455556666",
};

test("título con Lic. y ciudad, sin ciudad y para clínicas", () => {
  assert.equal(getProfileTitle({ ...base, city: "Rosario" }), "Lic. Juan Pérez — Kinesiología en Rosario");
  assert.equal(getProfileTitle(base), "Lic. Juan Pérez — Kinesiología");
  assert.equal(getProfileDisplayName({ ...base, name: "Lic. Ana Gómez" }), "Lic. Ana Gómez");
  assert.equal(getProfileDisplayName({ ...base, name: "Licenciada Ana Gómez" }), "Licenciada Ana Gómez");
  assert.equal(
    getProfileTitle({ ...base, city: "Córdoba", name: "Centro Kine Sur", type: "CLINICA" }),
    "Centro Kine Sur — Kinesiología en Córdoba",
  );
});

test("tratamientos: solo la lista cerrada, sin repetidos y en orden", () => {
  assert.deepEqual(normalizeTreatments(["atm", "magia", "rpg", "atm"]), ["rpg", "atm"]);
  assert.deepEqual(normalizeTreatments("rpg"), []);
});

test("normaliza y recorta los campos", () => {
  const fields = normalizeProfileFields({
    bio: ` ${"a".repeat(500)} `,
    city: "  Rosario ",
    homeVisits: "true",
    treatments: ["deportiva"],
  });
  assert.equal(fields.bio.length, 400);
  assert.equal(fields.city, "Rosario");
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
    getProfileDescription({ ...base, city: "Rosario", homeVisits: true, treatments: ["rpg", "atm", "deportiva"] }),
    "Kinesiología: RPG, ATM y deportiva en Rosario con atención a domicilio. Reservá tu turno online.",
  );
  assert.equal(getProfileDescription(base), "Kinesiología. Reservá tu turno online.");
});

test("JSON-LD: Physician para particulares y MedicalClinic para clínicas", () => {
  const url = "https://kineflow.ar/reservar/x";
  const personal = buildProfileJsonLd(
    { ...base, city: "Rosario", licenseNumber: "MP 1", publicAddress: "Corrientes 123", treatments: ["rpg"] },
    url,
  );
  assert.equal(personal["@type"], "Physician");
  assert.equal(personal.name, "Lic. Juan Pérez");
  assert.equal(personal.address.addressLocality, "Rosario");
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
