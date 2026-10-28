import assert from "node:assert/strict";
import {
  allocateMedicalOrders,
  buildMedicalOrderAlerts,
  countSeriesCoverage,
  getAppointmentOrderLabel,
  getOrderState,
} from "../src/lib/medical-orders.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const TODAY = "2026-10-28";

function order(overrides = {}) {
  return {
    authorizedSessions: 10,
    coverageType: "OBRA_SOCIAL",
    expiresOn: "2026-11-30",
    id: "o1",
    issuedOn: "2026-10-01",
    patientId: "p1",
    providerId: "osde",
    ...overrides,
  };
}

let seq = 0;
function appt(date, status, overrides = {}) {
  seq += 1;
  return {
    date,
    id: overrides.id ?? `a${seq}`,
    patientId: "p1",
    paymentType: "OBRA_SOCIAL",
    providerId: "osde",
    scheduledAt: `${date}T13:00:00.000Z`,
    status,
    ...overrides,
  };
}

test("solo asistió descuenta; ausencias y cancelados no", () => {
  const appointments = [
    appt("2026-10-02", "attended"),
    appt("2026-10-05", "no_show"),
    appt("2026-10-07", "cancelled"),
    appt("2026-10-09", "completed"),
  ];
  const { usage, byAppointment } = allocateMedicalOrders([order()], appointments, TODAY);
  assert.equal(usage.get("o1").used, 2);
  assert.equal(usage.get("o1").remaining, 8);
  assert.equal(byAppointment.get(appointments[3].id).sessionNumber, 2);
  assert.equal(byAppointment.has(appointments[1].id), false);
});

test("los pendientes se proyectan con su número de sesión", () => {
  const appointments = [appt("2026-10-20", "attended"), appt("2026-10-30", "pending")];
  const { byAppointment, usage } = allocateMedicalOrders([order()], appointments, TODAY);
  const info = byAppointment.get(appointments[1].id);
  assert.deepEqual(info, {
    authorizedSessions: 10,
    consumed: false,
    kind: "covered",
    orderId: "o1",
    sessionNumber: 2,
  });
  assert.equal(usage.get("o1").scheduled, 1);
  assert.equal(getAppointmentOrderLabel(info), "Sesión 2 de 10");
});

test("pasarse de la orden marca fuera de orden sin bloquear", () => {
  const appointments = [
    appt("2026-10-02", "attended"),
    appt("2026-10-03", "attended"),
    appt("2026-10-04", "attended"),
  ];
  const { byAppointment, usage } = allocateMedicalOrders(
    [order({ authorizedSessions: 2 })],
    appointments,
    TODAY,
  );
  assert.deepEqual(byAppointment.get(appointments[2].id), { kind: "exceeded", orderId: "o1" });
  assert.equal(usage.get("o1").state, "complete");
  assert.equal(getAppointmentOrderLabel(byAppointment.get(appointments[2].id)), "Fuera de orden");
});

test("sin orden: otro prestador, fuera de fechas o sin prestador", () => {
  const appointments = [
    appt("2026-10-10", "pending", { providerId: "ioma" }),
    appt("2026-09-20", "attended"),
    appt("2026-12-05", "pending"),
    appt("2026-10-10", "pending", { paymentType: "ART" }),
  ];
  const { byAppointment } = allocateMedicalOrders([order()], appointments, TODAY);
  for (const appointment of appointments) {
    assert.deepEqual(byAppointment.get(appointment.id), { kind: "no_order" });
  }
  const withoutProvider = allocateMedicalOrders([order({ providerId: null })], [appointments[1]], TODAY);
  assert.equal(withoutProvider.byAppointment.get(appointments[1].id).kind, "no_order");
});

test("particulares no cuentan", () => {
  const particular = appt("2026-10-10", "attended", { paymentType: "PARTICULAR", providerId: null });
  const { byAppointment, usage } = allocateMedicalOrders([order()], [particular], TODAY);
  assert.equal(byAppointment.has(particular.id), false);
  assert.equal(usage.get("o1").used, 0);
});

test("dos órdenes: la vieja se llena primero y la nueva sigue en 1", () => {
  const orders = [
    order({ authorizedSessions: 2, expiresOn: null, id: "vieja", issuedOn: "2026-09-01" }),
    order({ id: "nueva", issuedOn: "2026-10-15" }),
  ];
  const appointments = [
    appt("2026-10-10", "attended"),
    appt("2026-10-16", "attended"),
    appt("2026-10-20", "attended"),
  ];
  const { byAppointment } = allocateMedicalOrders(orders, appointments, TODAY);
  assert.equal(byAppointment.get(appointments[0].id).orderId, "vieja");
  assert.equal(byAppointment.get(appointments[1].id).orderId, "vieja");
  assert.equal(byAppointment.get(appointments[1].id).sessionNumber, 2);
  assert.equal(byAppointment.get(appointments[2].id).orderId, "nueva");
  assert.equal(byAppointment.get(appointments[2].id).sessionNumber, 1);
});

test("estado de la orden", () => {
  assert.equal(getOrderState({ authorizedSessions: 10, expiresOn: null }, 3, TODAY), "active");
  assert.equal(getOrderState({ authorizedSessions: 10, expiresOn: null }, 8, TODAY), "low");
  assert.equal(getOrderState({ authorizedSessions: 10, expiresOn: "2026-11-03" }, 1, TODAY), "expiring");
  assert.equal(getOrderState({ authorizedSessions: 10, expiresOn: "2026-10-27" }, 1, TODAY), "expired");
  assert.equal(getOrderState({ authorizedSessions: 10, expiresOn: "2026-10-27" }, 10, TODAY), "complete");
});

test("avisos: renovar con turnos sin lugar y paciente sin orden", () => {
  const orders = [order({ authorizedSessions: 3 })];
  const appointments = [
    appt("2026-10-20", "attended"),
    appt("2026-10-22", "attended"),
    appt("2026-10-30", "pending"),
    appt("2026-11-02", "pending"),
    appt("2026-11-04", "pending"),
    appt("2026-10-29", "pending", { patientId: "p2", providerId: "ioma" }),
    appt("2026-10-31", "pending", { patientId: "p2", providerId: "ioma" }),
    appt("2026-12-20", "pending", { patientId: "p3" }),
  ];
  const alerts = buildMedicalOrderAlerts(orders, appointments, TODAY);
  assert.deepEqual(alerts, [
    {
      expiresOn: "2026-11-30",
      kind: "renew",
      orderId: "o1",
      patientId: "p1",
      remaining: 1,
      state: "low",
      uncoveredScheduled: 2,
    },
    {
      appointmentId: appointments[5].id,
      date: "2026-10-29",
      kind: "no_order",
      patientId: "p2",
      scheduledAt: "2026-10-29T13:00:00.000Z",
    },
  ]);
});

test("una orden ya renovada no avisa", () => {
  const orders = [
    order({ authorizedSessions: 3, id: "vieja", issuedOn: "2026-09-01" }),
    order({ id: "nueva", issuedOn: "2026-10-25" }),
  ];
  const appointments = [appt("2026-09-10", "attended"), appt("2026-09-12", "attended")];
  assert.deepEqual(buildMedicalOrderAlerts(orders, appointments, TODAY), []);
});

test("serie: cuántos turnos nuevos entran en la orden", () => {
  const existing = [appt("2026-10-20", "attended"), appt("2026-10-22", "attended")];
  const series = [
    appt("2026-11-03", "pending", { id: "s1" }),
    appt("2026-11-05", "pending", { id: "s2" }),
    appt("2026-11-10", "pending", { id: "s3" }),
  ];
  assert.deepEqual(
    countSeriesCoverage([order({ authorizedSessions: 4 })], existing, series, TODAY),
    { covered: 2, uncovered: 1 },
  );
});
