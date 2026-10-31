import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  MercadoPagoOAuthError,
  buildAuthorizationUrl,
  createOAuthState,
  needsRefresh,
  requestOAuthToken,
  verifyOAuthState,
} from "../src/lib/mercadopago-oauth.ts";
import { decryptSecret, encryptSecret, parseEncryptionKey } from "../src/lib/token-crypto.ts";

async function test(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

const key = crypto.randomBytes(32);
const secret = "state-secret";

await test("cifra y descifra tokens; otra clave o texto alterado no descifra", () => {
  const encrypted = encryptSecret("APP_USR-123", key);
  assert.match(encrypted, /^v1\./);
  assert.ok(!encrypted.includes("APP_USR"));
  assert.equal(decryptSecret(encrypted, key), "APP_USR-123");
  assert.equal(decryptSecret(encrypted, crypto.randomBytes(32)), null);
  const parts = encrypted.split(".");
  parts[3] = Buffer.from("otro").toString("base64url");
  assert.equal(decryptSecret(parts.join("."), key), null);
  assert.equal(decryptSecret("texto plano", key), null);
  assert.notEqual(encryptSecret("x", key), encryptSecret("x", key));
});

await test("la clave tiene que ser de 32 bytes en base64", () => {
  assert.equal(parseEncryptionKey(""), null);
  assert.equal(parseEncryptionKey(Buffer.alloc(16).toString("base64")), null);
  assert.equal(parseEncryptionKey(key.toString("base64"))?.length, 32);
});

await test("state válido con el nonce de la cookie", () => {
  const { nonce, state } = createOAuthState({ now: 1000, secret, userId: "user-1" });
  assert.deepEqual(verifyOAuthState({ cookieNonce: nonce, now: 2000, secret, state }), {
    ok: true,
    userId: "user-1",
  });
});

await test("state rechazado: firma, vencimiento, nonce y formato", () => {
  const { nonce, state } = createOAuthState({ now: 0, secret, userId: "user-1" });
  const [payload] = state.split(".");
  const forged = `${Buffer.from(JSON.stringify({ exp: 9e15, nonce, userId: "otro" })).toString("base64url")}.${state.split(".")[1]}`;

  assert.equal(verifyOAuthState({ cookieNonce: nonce, now: 1, secret: "otra", state }).reason, "bad_signature");
  assert.equal(verifyOAuthState({ cookieNonce: nonce, now: 1, secret, state: forged }).reason, "bad_signature");
  assert.equal(verifyOAuthState({ cookieNonce: nonce, now: 16 * 60 * 1000, secret, state }).reason, "expired");
  assert.equal(verifyOAuthState({ cookieNonce: "otro", now: 1, secret, state }).reason, "nonce_mismatch");
  assert.equal(verifyOAuthState({ cookieNonce: undefined, now: 1, secret, state }).reason, "nonce_mismatch");
  assert.equal(verifyOAuthState({ cookieNonce: nonce, secret, state: payload }).reason, "malformed");
});

await test("URL de autorización con client_id, state y redirect_uri", () => {
  const url = new URL(buildAuthorizationUrl({ clientId: "123", redirectUri: "https://qa.kineflow.ar/cb", state: "s" }));
  assert.equal(url.origin + url.pathname, "https://auth.mercadopago.com/authorization");
  assert.equal(url.searchParams.get("client_id"), "123");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "s");
  assert.equal(url.searchParams.get("redirect_uri"), "https://qa.kineflow.ar/cb");
});

await test("refresh: solo si vence en menos de 30 días", () => {
  const now = Date.UTC(2026, 9, 28);
  assert.equal(needsRefresh(null, now), false);
  assert.equal(needsRefresh(new Date(now + 29 * 86400000).toISOString(), now), true);
  assert.equal(needsRefresh(new Date(now + 31 * 86400000).toISOString(), now), false);
});

await test("pedido de token: éxito y error invalid_grant", async () => {
  const calls = [];
  const okFetch = async (url, init) => {
    calls.push({ body: JSON.parse(init.body), url });
    return new Response(JSON.stringify({ access_token: "A", expires_in: 100, refresh_token: "R", user_id: 77 }), { status: 200 });
  };
  const token = await requestOAuthToken({
    apiUrl: "https://mp.test",
    body: { grant_type: "refresh_token", refresh_token: "R0" },
    clientId: "c",
    clientSecret: "s",
    fetchImpl: okFetch,
  });
  assert.equal(token.user_id, 77);
  assert.equal(calls[0].url, "https://mp.test/oauth/token");
  assert.deepEqual(calls[0].body, { client_id: "c", client_secret: "s", grant_type: "refresh_token", refresh_token: "R0" });

  const badFetch = async () => new Response(JSON.stringify({ error: "invalid_grant", message: "expired" }), { status: 400 });
  await assert.rejects(
    requestOAuthToken({ apiUrl: "x", body: { grant_type: "refresh_token", refresh_token: "R" }, clientId: "c", clientSecret: "s", fetchImpl: badFetch }),
    (error) => error instanceof MercadoPagoOAuthError && error.code === "invalid_grant",
  );
});
