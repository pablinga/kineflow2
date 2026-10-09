import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildMercadoPagoSignatureManifest,
  verifyMercadoPagoSignature,
} from "../src/lib/mercadopago-signature.ts";
import {
  STORED_SUBSCRIPTION_STATUSES,
  buildSubscriptionStatusUpdate,
  mapMercadoPagoStatus,
} from "../src/lib/mercadopago-status.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const SECRET = "test-webhook-secret";
const NOW = 1_791_000_000_000;

function sign({ dataId = "pre-123", requestId = "req-1", ts = String(NOW), secret = SECRET } = {}) {
  const hash = crypto
    .createHmac("sha256", secret)
    .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  return `ts=${ts},v1=${hash}`;
}

const verify = (overrides = {}) =>
  verifyMercadoPagoSignature({
    dataId: "pre-123",
    now: NOW,
    requestId: "req-1",
    secret: SECRET,
    signature: sign(),
    ...overrides,
  });

test("firma válida", () => {
  assert.deepEqual(verify(), { valid: true });
  // data.id alfanumérico: Mercado Pago lo firma en minúsculas.
  assert.deepEqual(verify({ dataId: "PRE-ABC", signature: sign({ dataId: "pre-abc" }) }), { valid: true });
  // ts en segundos también se acepta.
  const seconds = String(NOW / 1000);
  assert.deepEqual(verify({ signature: sign({ ts: seconds }) }), { valid: true });
});

test("firma inválida", () => {
  assert.equal(verify({ signature: sign({ secret: "otro" }) }).reason, "signature_mismatch");
  assert.equal(verify({ dataId: "pre-999" }).reason, "signature_mismatch");
  assert.equal(verify({ requestId: "req-2" }).reason, "signature_mismatch");
  assert.equal(verify({ signature: null }).reason, "missing_signature");
  assert.equal(verify({ signature: "ts=123" }).reason, "malformed_signature");
  assert.equal(verify({ signature: `ts=${NOW},v1=zzz` }).reason, "malformed_signature");
  assert.equal(verify({ secret: "" }).reason, "missing_secret");
});

test("timestamp vencido o adelantado", () => {
  const old = String(NOW - 11 * 60 * 1000);
  const future = String(NOW + 11 * 60 * 1000);
  assert.equal(verify({ signature: sign({ ts: old }) }).reason, "timestamp_out_of_range");
  assert.equal(verify({ signature: sign({ ts: future }) }).reason, "timestamp_out_of_range");
  assert.deepEqual(verify({ signature: sign({ ts: String(NOW - 9 * 60 * 1000) }) }), { valid: true });
});

test("manifest omite las partes que no vienen", () => {
  assert.equal(buildMercadoPagoSignatureManifest({ dataId: null, requestId: "r", ts: "1" }), "request-id:r;ts:1;");
  assert.equal(buildMercadoPagoSignatureManifest({ dataId: "A1", requestId: null, ts: "1" }), "id:a1;ts:1;");
});

test("mapeo de estados de Mercado Pago", () => {
  const cases = [
    ["authorized", "ACTIVE"],
    ["pending", "PENDING_PAYMENT"],
    ["paused", "PAUSED"],
    ["cancelled", "CANCELLED"],
    ["canceled", "CANCELLED"],
    ["expired", "EXPIRED"],
    ["algo-raro", "PAST_DUE"],
    [undefined, "PAST_DUE"],
  ];

  for (const [input, expected] of cases) {
    assert.equal(mapMercadoPagoStatus(input), expected, String(input));
  }
});

test("todo estado se guarda con un valor que acepta la constraint (antes 'FREE')", () => {
  for (const status of ["authorized", "pending", "paused", "cancelled", "expired", "otro"]) {
    const update = buildSubscriptionStatusUpdate({ id: "p1", status }, null, "2026-10-09T00:00:00Z");
    assert.ok(STORED_SUBSCRIPTION_STATUSES.includes(update.status), status);
    assert.equal(update.provider_subscription_id, "p1");
    assert.equal(update.provider_status, status);
  }
});

test("activación: fechas nuevas al activar y se conservan si ya estaba activa", () => {
  const now = "2026-10-09T12:00:00Z";
  const first = buildSubscriptionStatusUpdate(
    { id: "p1", next_payment_date: "2026-11-09T12:00:00Z", status: "authorized" },
    { activated_at: null, canceled_at: null, current_period_start: null, status: "PENDING_PAYMENT" },
    now,
  );
  assert.equal(first.status, "ACTIVE");
  assert.equal(first.activated_at, now);
  assert.equal(first.current_period_start, now);
  assert.equal(first.current_period_end, "2026-11-09T12:00:00Z");

  const again = buildSubscriptionStatusUpdate(
    { id: "p1", status: "authorized" },
    { activated_at: "2026-10-01T00:00:00Z", canceled_at: null, current_period_start: "2026-10-01T00:00:00Z", status: "ACTIVE" },
    now,
  );
  assert.equal(again.activated_at, "2026-10-01T00:00:00Z");
  assert.equal(again.current_period_start, "2026-10-01T00:00:00Z");

  const cancelled = buildSubscriptionStatusUpdate(
    { id: "p1", status: "cancelled" },
    { activated_at: "2026-10-01T00:00:00Z", canceled_at: null, current_period_start: "2026-10-01T00:00:00Z", status: "ACTIVE" },
    now,
  );
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(cancelled.canceled_at, now);
  assert.equal(cancelled.activated_at, "2026-10-01T00:00:00Z");
});
