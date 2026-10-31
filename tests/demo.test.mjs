import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildDemoEventAttribution,
  buildDemoSignupHref,
  isAcquisitionEventType,
  isValidDemoEventAttribution,
  sanitizeAttribution,
} from "../src/lib/attribution.ts";
import { buildDemoAppointments, buildDemoPatients, DEMO_PATIENTS } from "../src/lib/demo-data.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const stored = {
  first_visited_at: "2026-10-20T12:00:00.000Z",
  landing_page: "/",
  referrer: null,
  utm_campaign: "octubre",
  utm_content: null,
  utm_medium: "social",
  utm_source: "instagram",
  utm_term: null,
};

test("CTA: conserva los UTM de la URL", () => {
  assert.equal(
    buildDemoSignupHref("?utm_source=Instagram&utm_medium=social&utm_campaign=demo_oct&otro=1", null),
    "/registro?utm_source=instagram&utm_medium=social&utm_campaign=demo_oct",
  );
});

test("CTA: descarta UTM con datos personales", () => {
  assert.equal(
    buildDemoSignupHref("?utm_source=mail&utm_content=juan@mail.com", null),
    "/registro?utm_source=mail",
  );
});

test("CTA: sin UTM en la URL usa la atribución guardada", () => {
  assert.equal(
    buildDemoSignupHref("", stored),
    "/registro?utm_source=instagram&utm_medium=social&utm_campaign=octubre",
  );
});

test("CTA: la URL gana sobre la guardada y sin nada va a /registro", () => {
  assert.equal(buildDemoSignupHref("?utm_source=qr", stored), "/registro?utm_source=qr");
  assert.equal(buildDemoSignupHref("", null), "/registro");
});

test("demo_view: tipo válido y atribución propia o la de la campaña", () => {
  assert.equal(isAcquisitionEventType("demo_view"), true);
  const direct = buildDemoEventAttribution({ now: new Date("2026-10-28T12:00:00Z"), stored: null });
  assert.equal(direct.utm_source, "demo");
  assert.equal(direct.landing_page, "/demo");
  const campaign = buildDemoEventAttribution({ stored });
  assert.equal(campaign.utm_source, "instagram");
  assert.equal(campaign.first_visited_at, stored.first_visited_at);
  assert.equal(campaign.landing_page, "/demo");
  assert.equal(isValidDemoEventAttribution(sanitizeAttribution(campaign)), true);
  assert.equal(isValidDemoEventAttribution(sanitizeAttribution(stored)), false);
});

test("datos ficticios: turnos de la semana, futuros pendientes y sin cobrar", () => {
  const now = new Date(2026, 9, 28, 12, 0); // miércoles 12:00
  const appointments = buildDemoAppointments(now);
  assert.ok(appointments.length >= 10);
  for (const appointment of appointments) {
    const future = new Date(appointment.scheduledAt) > now;
    if (future) {
      assert.equal(appointment.rawStatus, "pending");
      assert.notEqual(appointment.paymentStatus, "paid");
    }
  }
  const days = new Set(appointments.map((a) => new Date(a.scheduledAt).getDay()));
  assert.ok(days.has(3), "hay turnos el día de hoy");
  const patients = buildDemoPatients(appointments, now);
  assert.equal(patients.length, DEMO_PATIENTS.length);
  assert.ok(patients.every((p) => /^(11 5555-\d{4})?$/.test(p.phone)), "teléfonos ficticios");
});

test("la demo no importa Supabase, hooks de datos ni APIs", () => {
  const files = [
    "src/app/demo/page.tsx",
    "src/app/demo/DemoClient.tsx",
    "src/lib/demo-data.ts",
    "src/components/turnos/AgendaAppointmentRow.tsx",
    "src/components/turnos/AgendaWeekStrip.tsx",
    "src/components/patients/PatientCard.tsx",
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /from "[^"]*supabase[^"]*"|getSupabase/i, `${file} no usa Supabase`);
    // Solo tipos de los hooks (se borran al compilar).
    assert.doesNotMatch(source, /^import (?!type )[^;]*from "@\/hooks\//m, `${file} solo importa tipos de hooks`);
    assert.doesNotMatch(source, /fetch\(/, `${file} no hace pedidos`);
  }
});
