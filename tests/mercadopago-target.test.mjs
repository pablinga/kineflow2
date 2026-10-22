import assert from "node:assert/strict";
import {
  decideReturnConfirmation,
  resolveSubscriptionTarget,
} from "../src/lib/mercadopago-subscription-target.ts";

// Base simulada: solo lo que usa resolveSubscriptionTarget (eq, is, order,
// limit, maybeSingle y el await de una lista).
function fakeAdmin(tables) {
  return {
    from(table) {
      const filters = [];
      let limit = Infinity;
      const rows = () => (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))).slice(0, limit);
      const builder = {
        eq(column, value) { filters.push((row) => row[column] === value); return builder; },
        is(column, value) { filters.push((row) => (row[column] ?? null) === value); return builder; },
        limit(value) { limit = value; return builder; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        order() { return builder; },
        select() { return builder; },
        then(resolve) { resolve({ data: rows(), error: null }); },
      };
      return builder;
    },
  };
}

const VICTIM = "11111111-1111-4111-8111-111111111111";
const ATTACKER = "22222222-2222-4222-8222-222222222222";
const row = (id, account, extra = {}) => ({
  account_id: account, account_type: "KINESIOLOGO", id, plans: { code: "INDEPENDIENTE" },
  provider: "mercadopago", provider_subscription_id: null, status: "PENDING_PAYMENT", workspace_id: null, ...extra,
});
const tables = {
  profiles: [
    { account_type: "KINESIOLOGO", email: "victima@kine.test", id: VICTIM },
    { account_type: "KINESIOLOGO", email: "atacante@kine.test", id: ATTACKER },
  ],
  subscriptions: [
    row("s-victim", VICTIM, { external_reference: `${VICTIM}:INDEPENDIENTE:account:abc` }),
    row("s-attacker", ATTACKER, { external_reference: `${ATTACKER}:INDEPENDIENTE:account:def` }),
    row("s-linked", VICTIM, { provider_subscription_id: "pre-linked", status: "ACTIVE" }),
  ],
};
const admin = fakeAdmin(tables);
const preapproval = (extra) => ({ id: "pre-x", status: "authorized", ...extra });

let failures = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL - ${name}\n${error.stack}`);
  }
}

async function decide(userId, providerSubscription) {
  const target = await resolveSubscriptionTarget(admin, providerSubscription);
  return decideReturnConfirmation({ providerStatus: providerSubscription.status, target, userId });
}

await test("el dueño confirma su pago con nuestra referencia", async () => {
  const decision = await decide(VICTIM, preapproval({ external_reference: `${VICTIM}:INDEPENDIENTE:account:abc` }));
  assert.equal(decision.action, "apply");
  assert.equal(decision.target.subscriptionId, "s-victim");
});

await test("el hueco: preapproval ajena con referencia fija del plan y sin email → no activa", async () => {
  assert.deepEqual(await decide(ATTACKER, preapproval({ external_reference: "KINEPART" })), { action: "skip", reason: "unresolved" });
  assert.deepEqual(await decide(ATTACKER, preapproval({ external_reference: "" })), { action: "skip", reason: "unresolved" });
});

await test("preapproval ajena con referencia fija y email de la víctima → es de la víctima, no del atacante", async () => {
  const providerSubscription = preapproval({ external_reference: "KINEPART", payer_email: "Victima@kine.test" });
  assert.deepEqual(await decide(ATTACKER, providerSubscription), { action: "skip", reason: "other_account" });
  assert.equal((await decide(VICTIM, providerSubscription)).action, "apply");
});

await test("preapproval con la referencia de otra cuenta → no activa", async () => {
  assert.deepEqual(
    await decide(ATTACKER, preapproval({ external_reference: `${VICTIM}:INDEPENDIENTE:account:abc` })),
    { action: "skip", reason: "other_account" },
  );
});

await test("preapproval ya asociada a otra cuenta → no activa", async () => {
  assert.deepEqual(await decide(ATTACKER, preapproval({ id: "pre-linked" })), { action: "skip", reason: "other_account" });
});

await test("pago propio todavía no autorizado → no activa", async () => {
  assert.deepEqual(
    await decide(VICTIM, preapproval({ external_reference: `${VICTIM}:INDEPENDIENTE:account:abc`, status: "pending" })),
    { action: "skip", reason: "not_authorized" },
  );
});

await test("referencia fija con email propio → activa la fila pendiente propia", async () => {
  const decision = await decide(ATTACKER, preapproval({ external_reference: "KINEPART", payer_email: "atacante@kine.test" }));
  assert.equal(decision.action, "apply");
  assert.equal(decision.target.subscriptionId, "s-attacker");
});

if (failures) process.exit(1);
