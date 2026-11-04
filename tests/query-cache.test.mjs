import assert from "node:assert/strict";
import {
  buildQueryCacheKey,
  clearQueryCache,
  readQueryCache,
  writeQueryCache,
} from "../src/lib/query-cache.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("sin clave no guarda ni devuelve nada", () => {
  writeQueryCache(null, [1]);
  assert.equal(readQueryCache(null), undefined);
});

test("guarda y devuelve por clave", () => {
  clearQueryCache();
  const key = buildQueryCacheKey("appointments", ["u1", "w1", true, null]);
  writeQueryCache(key, [{ id: "a" }]);
  assert.deepEqual(readQueryCache(key), [{ id: "a" }]);
  assert.equal(readQueryCache(buildQueryCacheKey("appointments", ["u2", "w1", true, null])), undefined);
});

test("la clave distingue usuario, espacio y parámetros", () => {
  const a = buildQueryCacheKey("patients", ["u1", "w1", 1, ""]);
  assert.notEqual(a, buildQueryCacheKey("patients", ["u2", "w1", 1, ""]));
  assert.notEqual(a, buildQueryCacheKey("patients", ["u1", "w2", 1, ""]));
  assert.notEqual(a, buildQueryCacheKey("patients", ["u1", "w1", 2, ""]));
  assert.notEqual(a, buildQueryCacheKey("appointments", ["u1", "w1", 1, ""]));
});

test("descarta la más vieja después de 40 entradas", () => {
  clearQueryCache();
  for (let i = 0; i < 41; i += 1) writeQueryCache(`k${i}`, i);
  assert.equal(readQueryCache("k0"), undefined);
  assert.equal(readQueryCache("k40"), 40);
});

test("reescribir una clave la deja como reciente", () => {
  clearQueryCache();
  for (let i = 0; i < 40; i += 1) writeQueryCache(`k${i}`, i);
  writeQueryCache("k0", "nuevo");
  writeQueryCache("k40", 40);
  assert.equal(readQueryCache("k0"), "nuevo");
  assert.equal(readQueryCache("k1"), undefined);
});

test("cerrar sesión vacía todo", () => {
  writeQueryCache("x", 1);
  clearQueryCache();
  assert.equal(readQueryCache("x"), undefined);
});
