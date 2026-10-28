import assert from "node:assert/strict";
import {
  computeDepositAmount,
  decideCancellationRefund,
  depositExpiresAt,
  depositIncome,
  depositOutcomeForPaymentStatus,
  getDepositChipLabel,
  remainingSessionAmount,
  validateDepositSettings,
} from "../src/lib/deposits.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const base = {
  cancellation_window_hours: 24,
  deposit_enabled: true,
  deposit_type: "fixed",
  deposit_value: 5000,
  payment_window_minutes: 30,
};

test("seña fija y porcentaje, solo particulares y con la seña activa", () => {
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 20000, settings: base }), 5000);
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 3000, settings: base }), 3000);
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 0, settings: base }), 5000);
  const percent = { ...base, deposit_type: "percent", deposit_value: 30 };
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 20000, settings: percent }), 6000);
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 0, settings: percent }), null);
  assert.equal(computeDepositAmount({ paymentType: "OBRA_SOCIAL", sessionAmount: 20000, settings: base }), null);
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 20000, settings: { ...base, deposit_enabled: false } }), null);
  assert.equal(computeDepositAmount({ paymentType: "PARTICULAR", sessionAmount: 20000, settings: null }), null);
});

test("vencimiento según el plazo para pagar", () => {
  assert.equal(depositExpiresAt(base, Date.UTC(2026, 9, 28, 12)), "2026-10-28T12:30:00.000Z");
});

test("validación del formulario", () => {
  assert.deepEqual(validateDepositSettings(base), []);
  assert.equal(validateDepositSettings({ ...base, deposit_value: 0 }).length, 1);
  assert.equal(validateDepositSettings({ ...base, deposit_type: "percent", deposit_value: 120 }).length, 1);
  assert.equal(validateDepositSettings({ ...base, payment_window_minutes: 5 }).length, 1);
  assert.equal(validateDepositSettings({ ...base, cancellation_window_hours: 200 }).length, 1);
  assert.deepEqual(validateDepositSettings({ ...base, deposit_enabled: false, deposit_value: 0 }), []);
});

test("cancelación: profesional devuelve; paciente según anticipación; sin seña cobrada nada", () => {
  const now = Date.UTC(2026, 9, 28, 12);
  const in48h = new Date(now + 48 * 3600 * 1000).toISOString();
  const in10h = new Date(now + 10 * 3600 * 1000).toISOString();
  const args = { cancellationWindowHours: 24, depositStatus: "paid", now };
  assert.equal(decideCancellationRefund({ ...args, cancelledBy: "professional", scheduledAt: in10h }), "refund");
  assert.equal(decideCancellationRefund({ ...args, cancelledBy: "patient", scheduledAt: in48h }), "refund");
  assert.equal(decideCancellationRefund({ ...args, cancelledBy: "patient", scheduledAt: in10h }), "retain");
  assert.equal(decideCancellationRefund({ ...args, cancelledBy: "patient", depositStatus: "awaiting", scheduledAt: in48h }), "none");
  assert.equal(decideCancellationRefund({ ...args, cancelledBy: "professional", depositStatus: null, scheduledAt: in48h }), "none");
});

test("ingresos: la seña cuenta si se cobró y no se devolvió; el saldo la descuenta", () => {
  assert.equal(depositIncome({ depositAmount: 5000, depositStatus: "paid" }), 5000);
  assert.equal(depositIncome({ depositAmount: 5000, depositStatus: "retained" }), 5000);
  assert.equal(depositIncome({ depositAmount: 5000, depositStatus: "refunded" }), 0);
  assert.equal(depositIncome({ depositAmount: 5000, depositStatus: "expired" }), 0);
  assert.equal(remainingSessionAmount({ depositAmount: 5000, depositStatus: "paid", sessionAmount: 20000 }), 15000);
  assert.equal(remainingSessionAmount({ depositAmount: 5000, depositStatus: "refunded", sessionAmount: 20000 }), 20000);
  assert.equal(remainingSessionAmount({ depositAmount: 25000, depositStatus: "paid", sessionAmount: 20000 }), 0);
});

test("estado del pago de Mercado Pago → resultado", () => {
  assert.equal(depositOutcomeForPaymentStatus("approved"), "paid");
  assert.equal(depositOutcomeForPaymentStatus("rejected"), "rejected");
  assert.equal(depositOutcomeForPaymentStatus("cancelled"), "rejected");
  assert.equal(depositOutcomeForPaymentStatus("refunded"), "refunded");
  assert.equal(depositOutcomeForPaymentStatus("charged_back"), "refunded");
  assert.equal(depositOutcomeForPaymentStatus("in_process"), "wait");
  assert.equal(depositOutcomeForPaymentStatus(undefined), "wait");
});

test("chip de la agenda", () => {
  assert.equal(getDepositChipLabel("paid", 5000), "Seña pagada · $ 5.000");
  assert.equal(getDepositChipLabel("retained", null), "Seña retenida");
});
