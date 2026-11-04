import assert from "node:assert/strict";
import {
  ACCOUNT_DELETION_REASON_MAX,
  buildDeletionConfirmationText,
  buildDeletionRequestText,
  normalizeDeletionReason,
} from "../src/lib/account-deletion.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("el motivo es opcional, sin espacios de más y con largo máximo", () => {
  assert.equal(normalizeDeletionReason(undefined), "");
  assert.equal(normalizeDeletionReason(42), "");
  assert.equal(normalizeDeletionReason("  ya no   lo uso \n "), "ya no lo uso");
  assert.equal(normalizeDeletionReason("x".repeat(900)).length, ACCOUNT_DELETION_REASON_MAX);
});

test("el mail interno trae lo necesario para procesar la baja", () => {
  const text = buildDeletionRequestText({
    accountType: "CONSULTORIO",
    email: "clinica@correo.com",
    fullName: "Clínica Sur",
    ownedWorkspaces: [{ name: "Clínica Sur", type: "CLINICA" }],
    reason: "",
    requestedAt: "2026-11-04T12:00:00.000Z",
    subscriptionStatus: "ACTIVE",
    userId: "u-1",
  });
  assert.match(text, /Email: clinica@correo\.com/);
  assert.match(text, /ID: u-1/);
  assert.match(text, /- Clínica Sur \(CLINICA\)/);
  assert.match(text, /Suscripción: ACTIVE/);
  assert.match(text, /Motivo: \(no indicó\)/);
});

test("sin espacios propios lo dice", () => {
  const text = buildDeletionRequestText({
    accountType: "",
    email: "a@b.com",
    fullName: "",
    ownedWorkspaces: [],
    reason: "caro",
    requestedAt: "x",
    subscriptionStatus: "",
    userId: "u",
  });
  assert.match(text, /- \(ninguno\)/);
  assert.match(text, /Suscripción: sin suscripción/);
  assert.match(text, /Motivo: caro/);
});

test("confirmación al usuario", () => {
  const text = buildDeletionConfirmationText({ fullName: "Ana", inbox: "contacto@kineflow.ar" });
  assert.match(text, /^Hola Ana,/);
  assert.match(text, /contacto@kineflow\.ar/);
  assert.match(buildDeletionConfirmationText({ fullName: "", inbox: "x" }), /^Hola,/);
});
