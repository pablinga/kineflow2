import assert from "node:assert/strict";
import {
  estimateHoursSaved,
  formatCompactCurrency,
  formatLongDate,
  formatShortDay,
  getArgentinaHour,
  getAttendanceSummary,
  getOccupancyPercent,
  getResolveRows,
  getWeekDelta,
  isAppointmentInProgress,
  pickTodayAppointments,
} from "../src/lib/dashboard-home.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("delta semanal: positivo en verde, negativo e igual en gris", () => {
  assert.deepEqual(getWeekDelta(12, 8), {
    delta: 4,
    label: "+4 vs. semana anterior",
    positive: true,
  });
  assert.equal(getWeekDelta(5, 7).label, "−2 vs. semana anterior");
  assert.equal(getWeekDelta(5, 7).positive, false);
  assert.equal(getWeekDelta(0, 0).label, "Igual que la semana anterior");
});

test("ocupación: sin horarios o con 0 minutos no divide por cero", () => {
  assert.equal(getOccupancyPercent(120, null), null);
  assert.equal(getOccupancyPercent(120, 0), null);
  assert.equal(getOccupancyPercent(0, 600), 0);
  assert.equal(getOccupancyPercent(450, 600), 75);
  // Turnos simultáneos pueden superar el 100%: el número es real, la barra se topea.
  assert.equal(getOccupancyPercent(900, 600), 150);
});

test("asistencia: porcentaje sobre asistió + canceló + ausente", () => {
  assert.deepEqual(getAttendanceSummary({ attended: 18, cancelled: 4, noShow: 2 }), {
    attendedPercent: 75,
    total: 24,
  });
});

test("asistencia: mes sin turnos no tiene porcentaje", () => {
  assert.deepEqual(getAttendanceSummary({ attended: 0, cancelled: 0, noShow: 0 }), {
    attendedPercent: null,
    total: 0,
  });
});

test("horas ahorradas: 3 min por recordatorio + 5 min por reserva online", () => {
  // 40 × 3 + 12 × 5 = 180 min = 3 h
  assert.equal(estimateHoursSaved(40, 12), 3);
  // Sin logs de recordatorios cuenta solo las reservas: 9 × 5 = 45 min ≈ 1 h
  assert.equal(estimateHoursSaved(null, 9), 1);
  assert.equal(estimateHoursSaved(0, 0), 0);
  // 10 × 3 = 30 min = 0,5 h
  assert.equal(estimateHoursSaved(10, 0), 0.5);
});

test("montos compactos para el gráfico", () => {
  assert.equal(formatCompactCurrency(118000), "$118k");
  assert.equal(formatCompactCurrency(1250000), "$1,3M");
  assert.equal(formatCompactCurrency(900), "$900");
  assert.equal(formatCompactCurrency(0), "$0");
});

test("fecha larga y corta en hora de Argentina", () => {
  // 2026-10-11 01:30 UTC = sábado 10 de octubre 22:30 en Argentina.
  assert.equal(formatLongDate(new Date("2026-10-11T01:30:00Z")), "Sábado 10 de octubre");
  assert.equal(formatLongDate(new Date("2026-10-11T03:30:00Z")), "Domingo 11 de octubre");
  assert.equal(formatShortDay("2026-08-17"), "17 ago");
});

test("hora de Argentina de un turno", () => {
  assert.equal(getArgentinaHour("2026-10-10T17:00:00Z"), 14);
  assert.equal(getArgentinaHour("2026-10-11T02:00:00Z"), 23);
});

const at = (iso, rawStatus = "pending", durationMinutes = 45) => ({
  durationMinutes,
  rawStatus,
  scheduledAt: iso,
});

test("turno en curso = 'Ahora'", () => {
  const now = new Date("2026-10-10T13:20:00Z");

  assert.equal(isAppointmentInProgress(at("2026-10-10T13:00:00Z"), now), true);
  assert.equal(isAppointmentInProgress(at("2026-10-10T12:00:00Z"), now), false);
  assert.equal(isAppointmentInProgress(at("2026-10-10T14:00:00Z"), now), false);
});

test("hoy: próximos 3, primero los que no tienen asistencia; el resto 'por la tarde'", () => {
  const now = new Date("2026-10-10T13:20:00Z"); // 10:20 en Argentina
  const list = [
    at("2026-10-10T12:00:00Z", "attended"), // 9:00 ya registrado: no se muestra
    at("2026-10-10T12:30:00Z", "pending"), // 9:30 sin registrar: se muestra
    at("2026-10-10T13:00:00Z", "pending"), // 10:00 en curso
    at("2026-10-10T14:00:00Z", "pending"), // 11:00
    at("2026-10-10T17:00:00Z", "pending"), // 14:00
    at("2026-10-10T18:00:00Z", "pending"), // 15:00
    at("2026-10-10T15:00:00Z", "cancelled"),
  ];
  const result = pickTodayAppointments(list, now);

  assert.deepEqual(
    result.visible.map((item) => item.scheduledAt),
    ["2026-10-10T12:30:00Z", "2026-10-10T13:00:00Z", "2026-10-10T14:00:00Z"],
  );
  assert.equal(result.later, 2);
  assert.equal(result.laterLabel, "+2 turnos por la tarde");
});

test("hoy: si alguno de los que quedan es a la mañana dice 'más tarde'", () => {
  const now = new Date("2026-10-10T11:00:00Z"); // 8:00
  const list = ["12", "13", "14", "15"].map((hour) => at(`2026-10-10T${hour}:00:00Z`));

  assert.equal(pickTodayAppointments(list, now).laterLabel, "+1 turno más tarde");
  assert.equal(pickTodayAppointments([], now).laterLabel, "");
});

test("para resolver: solo filas con contador; recepción sin evoluciones", () => {
  const base = {
    includeEvolutions: true,
    patientsWithoutNextAppointment: 3,
    paymentsHref: "/dashboard/ingresos",
    pendingPayments: 0,
    sessionsWithoutEvolution: 1,
    unregisteredAttendance: 0,
  };

  assert.deepEqual(
    getResolveRows(base).map((row) => row.label),
    ["pacientes sin próximo turno", "sesión sin evolución cargada"],
  );
  assert.deepEqual(
    getResolveRows({ ...base, includeEvolutions: false }).map((row) => row.id),
    ["next_appointment"],
  );
  assert.deepEqual(
    getResolveRows({
      ...base,
      patientsWithoutNextAppointment: 0,
      sessionsWithoutEvolution: 0,
    }),
    [],
  );
});
