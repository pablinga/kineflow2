import assert from "node:assert/strict";
import {
  availabilityRange,
  buildDayRows,
  buildMonthGrid,
  isVisibleAgendaAppointment,
  monthDateValues,
  searchPatients,
  shiftMonth,
  summarizeDays,
  upcomingSlots,
} from "../src/lib/clinic-agenda.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

function slot(date, time, professionals = 1) {
  const start = `${date}T${time}:00-03:00`;

  return {
    date,
    end: start,
    endTime: time,
    professionals: Array.from({ length: professionals }, (_, index) => ({
      clinicProfessionalId: `cp${index}`,
      name: `Pro ${index}`,
      professionalId: `p${index}`,
    })),
    start,
    startTime: time,
  };
}

test("grilla del mes empieza el lunes y completa semanas", () => {
  // Octubre 2026 empieza un jueves.
  const cells = buildMonthGrid(2026, 9);
  assert.equal(cells.length % 7, 0);
  assert.deepEqual(cells.slice(0, 4), [null, null, null, "2026-10-01"]);
  assert.equal(cells.filter(Boolean).length, 31);
  // Febrero 2027 empieza un lunes: sin huecos al principio.
  assert.equal(buildMonthGrid(2027, 1)[0], "2027-02-01");
});

test("cambio de mes cruza el año", () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { month: 0, year: 2027 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { month: 11, year: 2025 });
  assert.equal(monthDateValues(2028, 1).length, 29);
});

test("rango de disponibilidad desde hoy y nulo para meses pasados", () => {
  assert.deepEqual(availabilityRange(2026, 9, "2026-10-19"), {
    from: "2026-10-19",
    to: "2026-10-31",
  });
  assert.deepEqual(availabilityRange(2026, 10, "2026-10-19"), {
    from: "2026-11-01",
    to: "2026-11-30",
  });
  assert.equal(availabilityRange(2026, 8, "2026-10-19"), null);
});

test("color de cada día según horarios libres y turnos", () => {
  const summary = summarizeDays({
    appointmentDates: ["2026-10-21", "2026-10-22", "2026-10-15"],
    dates: ["2026-10-15", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-12"],
    holidays: ["2026-10-12"],
    slots: [
      ...["09:00", "09:30", "10:00", "10:30"].map((time) => slot("2026-10-20", time)),
      slot("2026-10-21", "09:00"),
    ],
    today: "2026-10-19",
  });

  assert.equal(summary.get("2026-10-15").level, "pasado");
  assert.equal(summary.get("2026-10-20").level, "libre");
  assert.equal(summary.get("2026-10-20").freeCount, 4);
  assert.equal(summary.get("2026-10-21").level, "poco");
  assert.equal(summary.get("2026-10-22").level, "lleno");
  assert.equal(summary.get("2026-10-23").level, "sin_atencion");
  // El 12 de octubre ya pasó en este ejemplo: "pasado" gana.
  assert.equal(summary.get("2026-10-12").level, "pasado");

  const future = summarizeDays({
    appointmentDates: [],
    dates: ["2026-11-20"],
    holidays: ["2026-11-20"],
    slots: [],
    today: "2026-10-19",
  });
  assert.equal(future.get("2026-11-20").level, "feriado");
});

test("lista del día mezcla turnos y libres por hora, turnos primero", () => {
  const appointments = [
    { id: "b", ownerId: "p1", rawStatus: "pending", scheduledAt: "2026-10-20T10:00:00-03:00", time: "10:00" },
    { id: "a", ownerId: "p1", rawStatus: "attended", scheduledAt: "2026-10-20T09:00:00-03:00", time: "09:00" },
  ];
  const rows = buildDayRows(appointments, [slot("2026-10-20", "10:00", 2), slot("2026-10-20", "09:30")]);

  assert.deepEqual(
    rows.map((row) => `${row.time}:${row.kind}`),
    ["09:00:busy", "09:30:free", "10:00:busy", "10:00:free"],
  );
});

test("los cancelados no ocupan lugar; los reprogramados siguen vigentes", () => {
  assert.equal(isVisibleAgendaAppointment({ rawStatus: "cancelled" }), false);
  assert.equal(isVisibleAgendaAppointment({ rawStatus: "rescheduled" }), true);
  assert.equal(isVisibleAgendaAppointment({ rawStatus: "no_show" }), true);
});

test("horarios libres que ya empezaron no se ofrecen", () => {
  const slots = [slot("2026-10-20", "09:00"), slot("2026-10-20", "11:00")];
  const now = new Date("2026-10-20T10:00:00-03:00");
  assert.deepEqual(upcomingSlots(slots, now).map((item) => item.startTime), ["11:00"]);
});

test("búsqueda de pacientes por nombre, DNI y teléfono", () => {
  const patients = [
    { document: "30111222", id: "1", name: "Ana Pérez", phone: "+54 9 11 5555-1234" },
    { document: "28999000", id: "2", name: "Daniel Álvarez", phone: "" },
    { document: "40123456", id: "3", name: "Ana María Sosa", phone: "351 444 1111" },
  ];

  assert.deepEqual(searchPatients(patients, "ana").map((p) => p.id), ["1", "3"]);
  assert.deepEqual(searchPatients(patients, "perez ana").map((p) => p.id), ["1"]);
  assert.deepEqual(searchPatients(patients, "alvarez").map((p) => p.id), ["2"]);
  assert.deepEqual(searchPatients(patients, "30.111").map((p) => p.id), ["1"]);
  assert.deepEqual(searchPatients(patients, "5555-12").map((p) => p.id), ["1"]);
  assert.deepEqual(searchPatients(patients, "").length, 0);
  assert.equal(searchPatients(patients, "a", 1).length, 1);
});
