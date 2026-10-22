import assert from "node:assert/strict";
import {
  buildSeriesCandidates,
  clampSeriesCount,
  planSeries,
  seriesSessionNumbers,
  seriesWeekday,
  splitIntoAvailabilityRanges,
} from "../src/lib/appointment-series.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("candidatas: lunes y miércoles después del primer turno", () => {
  // 2026-11-02 es lunes.
  assert.equal(seriesWeekday("2026-11-02"), 1);
  const candidates = buildSeriesCandidates({ startDate: "2026-11-02", weekdays: [1, 3] });
  assert.deepEqual(candidates.slice(0, 4), ["2026-11-04", "2026-11-09", "2026-11-11", "2026-11-16"]);
  assert.ok(candidates.every((date) => [1, 3].includes(seriesWeekday(date))));
  assert.deepEqual(buildSeriesCandidates({ startDate: "2026-11-02", weekdays: [] }), []);
});

test("serie: completa la cantidad salteando feriados y ocupados", () => {
  const candidates = buildSeriesCandidates({ startDate: "2026-11-02", weekdays: [1, 3] });
  const plan = planSeries({
    candidates,
    count: 5,
    startDate: "2026-11-02",
    statusOf: (date) => (date === "2026-11-09" ? "holiday" : date === "2026-11-11" ? "busy" : "ok"),
  });
  assert.deepEqual(plan.dates, ["2026-11-02", "2026-11-04", "2026-11-16", "2026-11-18", "2026-11-23"]);
  assert.deepEqual(plan.skipped, [
    { date: "2026-11-09", status: "holiday" },
    { date: "2026-11-11", status: "busy" },
  ]);
  assert.equal(plan.incomplete, false);
});

test("serie incompleta si no hay lugar en el período de búsqueda", () => {
  const plan = planSeries({
    candidates: ["2026-11-04", "2026-11-09"],
    count: 10,
    startDate: "2026-11-02",
    statusOf: () => "ok",
  });
  assert.equal(plan.dates.length, 3);
  assert.equal(plan.incomplete, true);
});

test("cantidad entre 2 y 30", () => {
  assert.equal(clampSeriesCount(1), 2);
  assert.equal(clampSeriesCount(50), 30);
  assert.equal(clampSeriesCount(Number.NaN), 2);
  assert.equal(clampSeriesCount(7.4), 7);
});

test("rangos de hasta 31 días para pedir disponibilidad", () => {
  const ranges = splitIntoAvailabilityRanges("2026-11-01", "2026-12-31");
  assert.deepEqual(ranges, [
    { from: "2026-11-01", to: "2026-12-01" },
    { from: "2026-12-02", to: "2026-12-31" },
  ]);
  assert.deepEqual(splitIntoAvailabilityRanges("2026-11-01", "2026-11-01"), [{ from: "2026-11-01", to: "2026-11-01" }]);
});

test("números de sesión consecutivos", () => {
  assert.deepEqual(seriesSessionNumbers(3, 4), [3, 4, 5, 6]);
  assert.deepEqual(seriesSessionNumbers(null, 2), [null, null]);
});
