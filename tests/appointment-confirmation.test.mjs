import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIRMATION_MIN_LEAD_MINUTES,
  decideAppointmentConfirmation,
  formatAppointmentDateTime,
} from "../src/lib/appointment-confirmation-rules.ts";

const NOW = Date.parse("2026-10-09T15:00:00Z");
const inMinutes = (minutes) => new Date(NOW + minutes * 60 * 1000).toISOString();

function decide(overrides = {}) {
  return decideAppointmentConfirmation({
    alreadyConfirmed: false,
    enabled: true,
    minLeadMinutes: CONFIRMATION_MIN_LEAD_MINUTES,
    now: NOW,
    patient: { phone_e164: "+5491155555555", whatsapp_consent: true },
    scheduledAt: inMinutes(24 * 60),
    throttled: false,
    ...overrides,
  });
}

test("turno futuro de paciente con consentimiento: se envía", () => {
  assert.deepEqual(decide(), { send: true });
});

test("sin consentimiento no se envía", () => {
  assert.deepEqual(decide({ patient: { phone_e164: "+5491155555555", whatsapp_consent: false } }), {
    reason: "no_consent",
    send: false,
  });
  assert.equal(decide({ patient: { phone_e164: "+5491155555555", whatsapp_consent: null } }).reason, "no_consent");
});

test("sin phone_e164 no se envía", () => {
  assert.equal(decide({ patient: { phone_e164: null, whatsapp_consent: true } }).reason, "no_phone");
});

test("turno pasado o histórico no se envía", () => {
  assert.equal(decide({ scheduledAt: inMinutes(-60) }).reason, "not_upcoming");
  assert.equal(decide({ scheduledAt: "2025-01-10T12:00:00Z" }).reason, "not_upcoming");
  assert.equal(decide({ scheduledAt: "fecha-invalida" }).reason, "not_upcoming");
});

test("turno a menos de 30 minutos no se envía; a 30 o más sí", () => {
  assert.equal(decide({ scheduledAt: inMinutes(29) }).reason, "not_upcoming");
  assert.deepEqual(decide({ scheduledAt: inMinutes(30) }), { send: true });
});

test("ya confirmado no se vuelve a enviar", () => {
  assert.equal(decide({ alreadyConfirmed: true }).reason, "already_confirmed");
});

test("throttle superado no se envía", () => {
  assert.equal(decide({ throttled: true }).reason, "throttled");
});

test("feature flag apagado no se envía (aunque todo lo demás se cumpla)", () => {
  assert.equal(decide({ enabled: false }).reason, "whatsapp_disabled");
});

test("reserva online (minLeadMinutes null) no exige anticipación", () => {
  assert.deepEqual(decide({ minLeadMinutes: null, scheduledAt: inMinutes(10) }), { send: true });
});

test("fecha y hora en hora de Argentina", () => {
  const { date, time } = formatAppointmentDateTime("2026-10-12T13:30:00Z");
  assert.equal(time, "10:30");
  assert.match(date, /lunes/);
  assert.match(date, /octubre/);
});
