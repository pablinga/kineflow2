import assert from "node:assert/strict";
import {
  canCreatePatientByPolicy,
  isPlanVisibleForAccount,
  PLAN_LIMITS,
} from "../src/lib/billing-policy.ts";
import { formatMonto } from "../src/lib/format.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("Plan Free permite crear pacientes hasta el limite configurado", () => {
  assert.equal(PLAN_LIMITS.FREE.maxPatients, 5);
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "KINESIOLOGO",
      activePatientCount: 4,
      patientLimit: 5,
      plan: "FREE",
      planStatus: "ACTIVO",
    }),
    true,
  );
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "KINESIOLOGO",
      activePatientCount: 5,
      patientLimit: 5,
      plan: "FREE",
      planStatus: "ACTIVO",
    }),
    false,
  );
});

test("Plan Independiente habilita pacientes propios sin limite", () => {
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "KINESIOLOGO",
      activePatientCount: 100,
      patientLimit: null,
      plan: "INDEPENDIENTE",
      planStatus: "ACTIVO",
    }),
    true,
  );
});

test("Un usuario individual no ve planes de consultorio como flujo principal", () => {
  assert.equal(isPlanVisibleForAccount("FREE", "KINESIOLOGO"), true);
  assert.equal(isPlanVisibleForAccount("INDEPENDIENTE", "KINESIOLOGO"), true);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_2", "KINESIOLOGO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_5", "KINESIOLOGO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_10", "KINESIOLOGO"), false);
});

test("Un usuario consultorio ve solo planes de consultorio como flujo principal", () => {
  assert.equal(isPlanVisibleForAccount("FREE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("INDEPENDIENTE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_2", "CONSULTORIO"), true);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_5", "CONSULTORIO"), true);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_10", "CONSULTORIO"), true);
});

test("Los montos se muestran con separador de miles argentino", () => {
  assert.equal(formatMonto(14900), "$ 14.900");
  assert.equal(formatMonto(20000), "$ 20.000");
});
