import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSeriesCalendar, normalizePromoFields, parseSocialImageFile } from "../src/lib/content/promo-image.ts";

test("parseSocialImageFile acepta solo <uuid>.jpg", () => {
  assert.equal(
    parseSocialImageFile("4F0A1C2D-D5BE-4C1E-8001-AE3B57403E12.jpg"),
    "4f0a1c2d-d5be-4c1e-8001-ae3b57403e12",
  );
  assert.equal(parseSocialImageFile("4f0a1c2d-d5be-4c1e-8001-ae3b57403e12"), null);
  assert.equal(parseSocialImageFile("4f0a1c2d-d5be-4c1e-8001-ae3b57403e12.png"), null);
  assert.equal(parseSocialImageFile("../etc/passwd.jpg"), null);
  assert.equal(parseSocialImageFile("not-a-uuid-at-all-not-a-uuid-at-all.jpg"), null);
});

test("normalizePromoFields exige título, recorta y completa valores por defecto", () => {
  assert.equal(normalizePromoFields({}), null);
  assert.equal(normalizePromoFields(null), null);
  assert.equal(normalizePromoFields({ title: "   " }), null);

  const fields = normalizePromoFields({ title: "x".repeat(100), visual: "otro" });
  assert.equal(fields.title.length, 60);
  assert.equal(fields.visual, "ninguno");
  assert.equal(fields.cta, "Gratis 3 meses");
});

test("perfil: máximo 3 horarios y 4 chips; selección fuera de rango se descarta", () => {
  const fields = normalizePromoFields({
    perfil: { chips: ["a", "b", "c", "d", "e"], name: "Lic. Carla Méndez", selected: 7, slots: ["1", "2", "3", "4"] },
    title: "Tu página",
    visual: "perfil",
  });
  assert.equal(fields.perfil.slots.length, 3);
  assert.equal(fields.perfil.chips.length, 4);
  assert.equal(fields.perfil.selected, 2);
});

test("serie de 10 los lun/mié/vie de nov 2026 saltea el feriado del 23 y termina el 25", () => {
  const fields = normalizePromoFields({
    serie: { count: 10, holidays: [23], month: 11, monthName: "Noviembre", weekdays: [0, 2, 4], year: 2026 },
    title: "10 sesiones,",
    visual: "serie",
  });
  const cells = buildSeriesCalendar(fields.serie);
  const sessions = cells.filter((c) => c.kind === "session").map((c) => c.day);
  const holidays = cells.filter((c) => c.kind === "holiday").map((c) => c.day);

  // 1/11/2026 es domingo: 6 celdas vacías antes.
  assert.deepEqual(cells.slice(0, 6).map((c) => c.kind), Array(6).fill("blank"));
  assert.equal(cells[6].day, 1);
  assert.deepEqual(sessions, [2, 4, 6, 9, 11, 13, 16, 18, 20, 25]);
  assert.deepEqual(holidays, [23]);
  assert.equal(cells.length % 7, 0);
});

test("un feriado que no cae en un día de la serie no se marca", () => {
  const cells = buildSeriesCalendar({
    count: 4,
    holidays: [24],
    label: "",
    month: 11,
    monthName: "Noviembre",
    weekdays: [0],
    year: 2026,
  });
  assert.equal(cells.filter((c) => c.kind === "holiday").length, 0);
  assert.deepEqual(cells.filter((c) => c.kind === "session").map((c) => c.day), [2, 9, 16, 23]);
});
