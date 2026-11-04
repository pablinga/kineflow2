import assert from "node:assert/strict";
import { formatPatientAge, getPatientAge } from "../src/lib/patient-age.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("cumple años el mismo día", () => {
  assert.equal(getPatientAge("1990-11-04", "2026-11-04"), 36);
});

test("todavía no cumplió este año", () => {
  assert.equal(getPatientAge("1990-11-05", "2026-11-04"), 35);
  assert.equal(getPatientAge("1990-12-01", "2026-11-04"), 35);
});

test("nacido el 29 de febrero", () => {
  assert.equal(getPatientAge("2000-02-29", "2026-02-28"), 25);
  assert.equal(getPatientAge("2000-02-29", "2026-03-01"), 26);
});

test("vacío, inválido o futuro → null", () => {
  assert.equal(getPatientAge("", "2026-11-04"), null);
  assert.equal(getPatientAge(null, "2026-11-04"), null);
  assert.equal(getPatientAge("04/11/1990", "2026-11-04"), null);
  assert.equal(getPatientAge("2027-01-01", "2026-11-04"), null);
});

test("texto de la edad", () => {
  assert.equal(formatPatientAge(1), "1 año");
  assert.equal(formatPatientAge(0), "0 años");
  assert.equal(formatPatientAge(36), "36 años");
  assert.equal(formatPatientAge(null), "");
});
