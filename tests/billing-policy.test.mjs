import assert from "node:assert/strict";
import fs from "node:fs";
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

test("Con el feature flag apagado no se muestran planes de consultorio", () => {
  assert.equal(isPlanVisibleForAccount("FREE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("INDEPENDIENTE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_2", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_5", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_10", "CONSULTORIO"), false);
});

test("Los montos se muestran con separador de miles argentino", () => {
  assert.equal(formatMonto(14900), "$ 14.900");
  assert.equal(formatMonto(20000), "$ 20.000");
});

test("Landing MVP1 habla solo a kinesiologos independientes", () => {
  const source = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.match(source, /kinesiologos independientes/);
  assert.match(source, /Gestiona tus pacientes, turnos y sesiones/);
  assert.doesNotMatch(source, /consultorios/i);
  assert.doesNotMatch(source, /clinicas/i);
});

test("Registro nuevo fuerza cuenta de kinesiologo independiente", () => {
  const source = fs.readFileSync("src/app/registro/page.tsx", "utf8");

  assert.match(source, /account_type: "KINESIOLOGO"/);
  assert.doesNotMatch(source, /CONSULTORIO/);
  assert.match(source, /He leido y acepto/);
});

test("Retorno de Mercado Pago no activa el plan directamente", () => {
  const source = fs.readFileSync("src/app/api/billing/confirm-return/route.ts", "utf8");

  assert.doesNotMatch(source, /applyMercadoPagoSubscriptionToAccount/);
  assert.match(source, /select\("plan, estado_plan/);
});

test("Webhook valida Plan Independiente y mail posterior a activacion", () => {
  const webhook = fs.readFileSync("src/app/api/webhooks/mercadopago/route.ts", "utf8");
  const billingServer = fs.readFileSync("src/lib/billing-server.ts", "utf8");

  assert.match(webhook, /parsed\.planCode !== "INDEPENDIENTE"/);
  assert.match(webhook, /payment_events/);
  assert.match(billingServer, /internalStatus === "ACTIVE"/);
  assert.match(billingServer, /sendSubscriptionActivatedEmail/);
});

test("Baja de suscripcion llama a Mercado Pago y registra referencia", () => {
  const source = fs.readFileSync("src/app/api/billing/cancel-subscription/route.ts", "utf8");

  assert.match(source, /cancelMercadoPagoSubscription/);
  assert.match(source, /cancellationReference/);
  assert.match(source, /sendSubscriptionCancelledEmail/);
});

test("Links legales existen", () => {
  [
    "src/app/terminos-y-condiciones/page.tsx",
    "src/app/politica-de-privacidad/page.tsx",
    "src/app/politica-de-suscripcion-y-baja/page.tsx",
    "src/app/baja-de-servicio/page.tsx",
    "src/app/arrepentimiento/page.tsx",
    "src/app/contacto-soporte/page.tsx",
  ].forEach((path) => assert.equal(fs.existsSync(path), true, path));
});
