import assert from "node:assert/strict";
import {
  selectLandingTestimonials,
  testimonialByline,
  testimonialInitials,
} from "../src/lib/landing-testimonials.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const melisa = { name: "Melisa", quote: "Doy los turnos de todo el equipo.", role: "Kinesióloga" };
const estanislao = { name: "Estanislao", quote: "Cargo la evolución desde el celular.", role: "Kinesiólogo" };

test("lista vacía: no se muestra la sección ni el testimonio del hero", () => {
  assert.equal(selectLandingTestimonials([], "full"), null);
  assert.equal(selectLandingTestimonials([], "compact"), null);
});

test("el hero muestra solo el primero; la sección, todos", () => {
  assert.deepEqual(selectLandingTestimonials([melisa, estanislao], "compact"), [melisa]);
  assert.deepEqual(selectLandingTestimonials([melisa, estanislao], "full"), [melisa, estanislao]);
});

test("iniciales y rol con ciudad opcional", () => {
  assert.equal(testimonialInitials("Melisa"), "M");
  assert.equal(testimonialInitials("  ana  paz gómez "), "AP");
  assert.equal(testimonialByline(melisa), "Kinesióloga");
  assert.equal(testimonialByline({ ...melisa, city: "Rosario" }), "Kinesióloga · Rosario");
  assert.equal(testimonialByline({ ...melisa, city: "  " }), "Kinesióloga");
});
