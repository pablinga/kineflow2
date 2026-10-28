import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BODY_ZONE_KEYS,
  buildPainLocationText,
  getBodyZoneKey,
  getBodyZoneLabel,
  normalizeBodyZones,
  searchBodyZones,
  toggleBodyZone,
} from "../src/lib/body-zones.ts";
import { BODY_FIGURES } from "../src/lib/body-map-figures.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("labels con y sin lado", () => {
  assert.equal(getBodyZoneLabel("rodilla_der"), "Rodilla der.");
  assert.equal(getBodyZoneLabel("hombro_izq"), "Hombro izq.");
  assert.equal(getBodyZoneLabel("lumbar"), "Lumbar");
  assert.equal(getBodyZoneLabel("lumbar_der"), "");
  assert.equal(getBodyZoneLabel("rodilla"), "");
  assert.equal(getBodyZoneLabel("inventada"), "");
});

test("la clave respeta si la zona lleva lado", () => {
  assert.equal(getBodyZoneKey("rodilla", "der"), "rodilla_der");
  assert.equal(getBodyZoneKey("lumbar", "izq"), "lumbar");
  assert.equal(getBodyZoneKey("inventada", "der"), null);
});

test("normalizar descarta inválidas, repetidas y ordena por catálogo", () => {
  assert.deepEqual(
    normalizeBodyZones(["rodilla_der", "x", "cervical", "rodilla_der", "hombro_izq"]),
    ["cervical", "hombro_izq", "rodilla_der"],
  );
});

test("toggle agrega y quita", () => {
  const withKnee = toggleBodyZone(["lumbar"], "rodilla_der");
  assert.deepEqual(withKnee, ["lumbar", "rodilla_der"]);
  assert.deepEqual(toggleBodyZone(withKnee, "lumbar"), ["rodilla_der"]);
  assert.deepEqual(toggleBodyZone(withKnee, "inventada"), withKnee);
});

test("texto de pain_location", () => {
  assert.equal(
    buildPainLocationText(["rodilla_der", "lumbar"], "  Menisco interno "),
    "Lumbar, Rodilla der. · Menisco interno",
  );
  assert.equal(buildPainLocationText(["lumbar"], ""), "Lumbar");
  assert.equal(buildPainLocationText([], "Rodilla derecha"), "Rodilla derecha");
  assert.equal(buildPainLocationText([], "  "), "");
});

test("búsqueda sin tildes", () => {
  const groups = searchBodyZones("torax");
  assert.deepEqual(groups, [{ keys: ["torax"], name: "Tronco y cabeza" }]);
  assert.equal(searchBodyZones("rodilla")[0].keys.length, 2);
  assert.deepEqual(searchBodyZones("zzz"), []);
  assert.equal(
    searchBodyZones("").reduce((total, group) => total + group.keys.length, 0),
    BODY_ZONE_KEYS.length,
  );
});

test("el check de la migración tiene exactamente las claves del catálogo", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/202610280005_patient_evaluation_body_zones.sql", import.meta.url),
    "utf8",
  );
  const inCheck = [...sql.matchAll(/^\s+'([a-z_]+)'/gm)].map((match) => match[1]);
  assert.deepEqual(inCheck, BODY_ZONE_KEYS);
});

test("los dibujos solo usan zonas del catálogo y cubren cada lado", () => {
  for (const sex of ["female", "male"]) {
    const drawn = new Set();

    for (const view of ["front", "back"]) {
      const figure = BODY_FIGURES[sex][view];
      for (const [zoneId, side] of [...figure.shapes, ...figure.dots]) {
        const key = getBodyZoneKey(zoneId, side);
        assert.ok(key && BODY_ZONE_KEYS.includes(key), `${sex}/${view}: ${zoneId}`);
        drawn.add(key);
      }
    }

    // Todo lo del catálogo se puede marcar en el dibujo, salvo ATM (solo lista).
    const missing = BODY_ZONE_KEYS.filter((key) => !drawn.has(key));
    assert.deepEqual(missing, ["atm"], `${sex}: faltan ${missing.join(", ")}`);
  }
});
