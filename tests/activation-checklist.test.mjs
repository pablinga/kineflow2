import assert from "node:assert/strict";
import {
  getActivationChecklistMode,
  getActivationGreeting,
  getActivationProgress,
  getActivationSteps,
  getFirstPendingStepId,
  getPublicBookingLink,
  getSupportWhatsAppUrl,
} from "../src/lib/activation-checklist.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const newAccount = {
  bookingLinkSharedAt: null,
  hasAvailability: false,
  onlineBookingCount: 0,
  patientCount: 0,
};

const kinesiologo = {
  accountType: "KINESIOLOGO",
  dismissedAt: null,
  hasAttendedAppointment: false,
  workspaceRole: "ADMIN",
  workspaceType: "PERSONAL",
};

test("cuenta nueva: 1 de 4 (25%), el primer pendiente es pacientes", () => {
  const steps = getActivationSteps(newAccount);

  assert.deepEqual(getActivationProgress(steps), {
    completed: 1,
    percent: 25,
    total: 4,
  });
  assert.equal(getFirstPendingStepId(steps), "patients");
});

test("con 1 paciente el paso 2 queda completo y sigue horarios", () => {
  const steps = getActivationSteps({ ...newAccount, patientCount: 1 });

  assert.equal(steps.find((step) => step.id === "patients").done, true);
  assert.equal(getActivationProgress(steps).percent, 50);
  assert.equal(getFirstPendingStepId(steps), "availability");
});

test("el paso 4 se completa al compartir o con la primera reserva online", () => {
  const shared = getActivationSteps({
    ...newAccount,
    bookingLinkSharedAt: "2026-10-10T12:00:00Z",
  });
  const booked = getActivationSteps({ ...newAccount, onlineBookingCount: 1 });

  assert.equal(shared.find((step) => step.id === "booking_link").done, true);
  assert.equal(booked.find((step) => step.id === "booking_link").done, true);
});

test("los pasos pendientes no tienen que ser consecutivos", () => {
  const steps = getActivationSteps({ ...newAccount, hasAvailability: true });

  assert.equal(getFirstPendingStepId(steps), "patients");
  assert.equal(getActivationProgress(steps).completed, 2);
});

test("todo completo: 100% y sin checklist", () => {
  const steps = getActivationSteps({
    bookingLinkSharedAt: "2026-10-10T12:00:00Z",
    hasAvailability: true,
    onlineBookingCount: 0,
    patientCount: 3,
  });

  assert.equal(getActivationProgress(steps).percent, 100);
  assert.equal(getFirstPendingStepId(steps), null);
  assert.equal(getActivationChecklistMode({ ...kinesiologo, steps }), "hidden");
});

test("sin turnos asistidos: checklist completo; con actividad: compacto", () => {
  const steps = getActivationSteps(newAccount);

  assert.equal(getActivationChecklistMode({ ...kinesiologo, steps }), "full");
  assert.equal(
    getActivationChecklistMode({
      ...kinesiologo,
      hasAttendedAppointment: true,
      steps,
    }),
    "compact",
  );
});

test("Ocultar esconde el checklist", () => {
  const steps = getActivationSteps(newAccount);

  assert.equal(
    getActivationChecklistMode({
      ...kinesiologo,
      dismissedAt: "2026-10-10T12:00:00Z",
      steps,
    }),
    "hidden",
  );
});

test("recepción y profesionales del equipo nunca lo ven; el admin de la clínica sí", () => {
  const steps = getActivationSteps(newAccount);

  assert.equal(
    getActivationChecklistMode({
      ...kinesiologo,
      accountType: "RECEPCION",
      steps,
      workspaceRole: "RECEPCION",
      workspaceType: "CLINICA",
    }),
    "hidden",
  );
  assert.equal(
    getActivationChecklistMode({
      ...kinesiologo,
      steps,
      workspaceRole: "KINESIOLOGO",
      workspaceType: "CLINICA",
    }),
    "hidden",
  );
  assert.equal(
    getActivationChecklistMode({
      ...kinesiologo,
      accountType: "CONSULTORIO",
      steps,
      workspaceRole: "ADMIN",
      workspaceType: "CLINICA",
    }),
    "full",
  );
});

test("saludo neutro con el primer nombre", () => {
  assert.equal(getActivationGreeting("Ana María Pérez"), "¡Hola, Ana!");
  assert.equal(getActivationGreeting("  "), "¡Hola!");
});

test("link de WhatsApp de soporte solo con un número válido", () => {
  assert.equal(getSupportWhatsAppUrl(undefined, "hola"), null);
  assert.equal(getSupportWhatsAppUrl("", "hola"), null);
  assert.equal(
    getSupportWhatsAppUrl("+54 9 11 1234-5678", "Hola, ayuda"),
    "https://wa.me/5491112345678?text=Hola%2C%20ayuda",
  );
});

test("link público de reservas", () => {
  assert.equal(
    getPublicBookingLink("ws-1", "https://qa.kineflow.ar/"),
    "https://qa.kineflow.ar/reservar/ws-1",
  );
  assert.equal(
    getPublicBookingLink("ws-1", undefined),
    "https://kineflow.ar/reservar/ws-1",
  );
});
