// E2E de las señas de la reserva online, sin red: levanta un Supabase falso
// (PostgREST + Auth mínimos, puerto 54332) y un Mercado Pago falso (API,
// OAuth y una página de checkout, puerto 54340) y maneja el dev server real
// con Playwright y llamadas HTTP.
//
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54332 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon \
//   SUPABASE_SERVICE_ROLE_KEY=fake-service NEXT_PUBLIC_APP_URL=http://localhost:3100 \
//   MERCADOPAGO_API_URL=http://localhost:54340 MERCADOPAGO_WEBHOOK_SECRET=wh-secret \
//   MP_OAUTH_CLIENT_ID=client-id MP_OAUTH_CLIENT_SECRET=client-secret \
//   MP_TOKEN_ENCRYPTION_KEY=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8= CRON_SECRET=cron-secret \
//   npx next dev -p 3100 &
//   npm install --no-save playwright   # o PW_CHROMIUM=/ruta/a/chrome
//   node scripts/deposits-e2e.mjs
//
// Casos: flujo feliz, webhook duplicado, pago rechazado, vencimiento (y pago
// tardío reembolsado), token por vencer (refresh) y token revocado (reserva
// sin seña + aviso), reembolso al cancelar el profesional, seña retenida al
// cancelar el paciente tarde y vinculación OAuth (state + cookie).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { decryptSecret, encryptSecret } from "../src/lib/token-crypto.ts";

const APP = process.env.APP_URL || "http://localhost:3100";
const SUPA_PORT = 54332;
const MP_PORT = 54340;
const MP = `http://localhost:${MP_PORT}`;
const SHOTS = process.env.SHOTS_DIR || "/tmp/deposits-e2e";
const KEY = Buffer.from("AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", "base64");
const WEBHOOK_SECRET = "wh-secret";
const CRON_SECRET = "cron-secret";
mkdirSync(SHOTS, { recursive: true });

const OWNER = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SELLER_ID = "9001";

// ---------------------------------------------------------------- Supabase --

function seed() {
  return {
    acquisition_events: [],
    appointment_notifications: [],
    appointments: [],
    art_providers: [],
    deposit_settings: [{
      cancellation_window_hours: 24, deposit_enabled: true, deposit_type: "fixed", deposit_value: 5000,
      last_fallback_notice_at: null, payment_window_minutes: 30, workspace_id: WORKSPACE,
    }],
    independent_availability: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      active: true, ends_at: "20:00:00", id: `av${weekday}`, owner_id: OWNER, starts_at: "08:00:00",
      valid_from: null, valid_to: null, weekday,
    })),
    insurance_providers: [],
    mp_connections: [connectionRow("APP_USR-seller-token", "TG-refresh-1", 120)],
    patients: [],
    payment_events: [],
    profiles: [{ account_type: "KINESIOLOGO", email: "laura@kine.test", full_name: "Laura Gómez", id: OWNER }],
    workspace_blocked_dates: [],
    workspace_members: [{ role: "ADMIN", status: "accepted", user_id: OWNER, workspace_id: WORKSPACE }],
    workspace_public_profiles: [],
    workspaces: [{
      address: "Corrientes 123", default_session_duration_minutes: 60, default_session_price: 20000,
      email: "laura@kine.test", id: WORKSPACE, max_simultaneous_appointments: 1, name: "Consultorio Laura",
      owner_id: OWNER, phone: "341 555 0000", source_clinic_id: null, type: "PERSONAL",
    }],
  };
}

function connectionRow(accessToken, refreshToken, daysToExpire) {
  return {
    access_token_encrypted: encryptSecret(accessToken, KEY), connected_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + daysToExpire * 86400000).toISOString(), id: "conn-1", last_error: null,
    live_mode: false, mp_user_id: SELLER_ID, professional_id: OWNER,
    refresh_token_encrypted: encryptSecret(refreshToken, KEY), status: "active",
  };
}

let tables = seed();

function parseIn(value) {
  return value.replace(/^\(|\)$/g, "").split(",").map((item) => item.replace(/^"|"$/g, ""));
}

function matches(row, key, raw) {
  const negate = raw.startsWith("not.");
  const expr = negate ? raw.slice(4) : raw;
  const [op, ...rest] = expr.split(".");
  const value = rest.join(".");
  const cell = row[key];
  const text = cell === null || cell === undefined ? null : String(cell);
  let ok;
  if (op === "eq") ok = text === value;
  else if (op === "neq") ok = text !== value;
  else if (op === "is") ok = value === "null" ? text === null : text === value;
  else if (op === "in") ok = parseIn(value).includes(text);
  else if (op === "gte") ok = text !== null && text >= value;
  else if (op === "gt") ok = text !== null && text > value;
  else if (op === "lte") ok = text !== null && text <= value;
  else if (op === "lt") ok = text !== null && text < value;
  else throw new Error(`filtro no soportado: ${key}=${raw}`);
  return negate ? !ok : ok;
}

function filterRows(rows, params) {
  return rows.filter((row) =>
    [...params].every(([key, raw]) => {
      if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) return true;
      if (key === "or") {
        return raw.replace(/^\(|\)$/g, "").split(",").some((part) => {
          const [column, ...rest] = part.split(".");
          return matches(row, column, rest.join("."));
        });
      }
      return matches(row, key, raw);
    }),
  );
}

function topLevelColumns(select) {
  const columns = [];
  let depth = 0;
  let current = "";
  for (const char of select) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      columns.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) columns.push(current.trim());
  return columns.map((column) => column.split("(")[0].split(":").pop().replace("!inner", "").trim());
}

const EMBEDS = { patients: "patient_id", profiles: "owner_id", workspaces: "workspace_id" };

function project(rows, select) {
  if (!select || select === "*") return rows;
  const columns = topLevelColumns(select);
  return rows.map((row) => Object.fromEntries(columns.map((column) => [
    column,
    EMBEDS[column] ? tables[column].find((item) => item.id === row[EMBEDS[column]]) ?? null : row[column] ?? null,
  ])));
}

// Imita validate_appointment_schedule: un turno no cancelado no puede pisar a otro.
function scheduleConflict(candidate, ignoreId) {
  if (candidate.status === "cancelled") return false;
  const start = new Date(candidate.scheduled_at).getTime();
  const end = start + candidate.duration_minutes * 60000;
  return tables.appointments.some((other) => {
    if (other.id === ignoreId || other.status === "cancelled" || other.owner_id !== candidate.owner_id) return false;
    const otherStart = new Date(other.scheduled_at).getTime();
    return otherStart < end && start < otherStart + other.duration_minutes * 60000;
  });
}

const APPOINTMENT_DEFAULTS = {
  cancelled_at: null, cancelled_by: null, deposit_amount: null, deposit_expires_at: null, deposit_mp_payment_id: null,
  deposit_paid_at: null, deposit_preference_id: null, deposit_refund_id: null, deposit_refunded_at: null,
  deposit_status: null, payment_status: "pending", session_number: null, treatment_id: null,
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const supabase = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${SUPA_PORT}`);
  const body = await readBody(req);
  const auth = req.headers.authorization ?? "";

  if (url.pathname.startsWith("/auth/v1/user")) {
    if (!auth.startsWith("Bearer user-")) return send(res, 401, { message: "invalid token" });
    const id = auth.replace("Bearer user-", "");
    return send(res, 200, { app_metadata: {}, aud: "authenticated", email: "laura@kine.test", id, role: "authenticated", user_metadata: {} });
  }

  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = url.pathname.split("/").pop();
    const results = { check_booking_rate_limit: false, check_whatsapp_send_throttle: false, get_account_access_level: "PAID_ACTIVE" };
    return send(res, 200, results[fn] ?? null);
  }

  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (!table) return send(res, 404, { message: "sin ruta" });
  tables[table] ??= [];
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const select = url.searchParams.get("select");
  const prefer = req.headers.prefer ?? "";

  const finish = (rows, status = 200) => {
    const projected = project(rows, select);
    if (single) return projected.length ? send(res, status, projected[0]) : send(res, 406, { code: "PGRST116", message: "0 rows" });
    return send(res, status, projected, { "content-range": `0-${Math.max(projected.length - 1, 0)}/${projected.length}` });
  };

  if (req.method === "GET" || req.method === "HEAD") {
    let rows = filterRows(tables[table], url.searchParams);
    const limit = Number(url.searchParams.get("limit") || 0);
    if (limit) rows = rows.slice(0, limit);
    return finish(rows);
  }

  if (req.method === "POST") {
    const payload = JSON.parse(body || "{}");
    const rows = Array.isArray(payload) ? payload : [payload];
    const conflict = url.searchParams.get("on_conflict");
    const saved = [];
    for (const row of rows) {
      if (conflict) {
        const keys = conflict.split(",");
        const existing = tables[table].find((item) => keys.every((key) => String(item[key]) === String(row[key])));
        if (existing) {
          Object.assign(existing, row);
          saved.push(existing);
          continue;
        }
      }
      if (table === "payment_events" && tables.payment_events.some((item) => item.event_id === row.event_id && item.provider === row.provider)) {
        return send(res, 409, { code: "23505", message: "duplicate key value violates unique constraint" });
      }
      const created = { id: crypto.randomUUID(), ...(table === "appointments" ? APPOINTMENT_DEFAULTS : {}), ...row };
      if (table === "payment_events") Object.assign(created, { attempts: 1, processed: false, ...row });
      if (table === "appointments" && scheduleConflict(created)) {
        return send(res, 400, { code: "P0001", message: "Ya hay un turno en ese horario." });
      }
      tables[table].push(created);
      saved.push(created);
    }
    return prefer.includes("return=representation") ? finish(saved, 201) : send(res, 201);
  }

  if (req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    const rows = filterRows(tables[table], url.searchParams);
    if (table === "appointments" && rows.some((row) => scheduleConflict({ ...row, ...patch }, row.id))) {
      return send(res, 400, { code: "P0001", message: "Ya hay un turno en ese horario." });
    }
    rows.forEach((row) => Object.assign(row, patch));
    return prefer.includes("return=representation") ? finish(rows) : send(res, 204);
  }

  if (req.method === "DELETE") {
    const rows = filterRows(tables[table], url.searchParams);
    tables[table] = tables[table].filter((row) => !rows.includes(row));
    return send(res, 204);
  }

  return send(res, 405, { message: "método no soportado" });
});

// ----------------------------------------------------------- Mercado Pago --

const mp = {
  oauthCodes: new Map([["code-ok", { access_token: "APP_USR-oauth-token", refresh_token: "TG-oauth-refresh" }]]),
  payments: new Map(),
  preferences: new Map(),
  refreshTokens: new Map([["TG-refresh-1", "APP_USR-refreshed-token"]]),
  refunds: [],
  tokens: new Set(["APP_USR-seller-token", "APP_USR-refreshed-token", "APP_USR-oauth-token"]),
  webhooks: [],
};
let nextPaymentId = 7000000001;

function sellerFromAuth(req) {
  const token = (req.headers.authorization ?? "").replace("Bearer ", "");
  return mp.tokens.has(token) ? SELLER_ID : null;
}

function signWebhook(dataId) {
  const ts = String(Date.now());
  const requestId = crypto.randomUUID();
  const hash = crypto.createHmac("sha256", WEBHOOK_SECRET).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
  return { "x-request-id": requestId, "x-signature": `ts=${ts},v1=${hash}` };
}

async function sendWebhook(paymentId, notificationId = `notif-${crypto.randomUUID()}`) {
  const response = await fetch(`${APP}/api/mercadopago/webhook?data.id=${paymentId}&type=payment`, {
    body: JSON.stringify({ action: "payment.created", data: { id: String(paymentId) }, id: notificationId, live_mode: false, type: "payment", user_id: Number(SELLER_ID) }),
    headers: { "content-type": "application/json", ...signWebhook(String(paymentId)) },
    method: "POST",
  });
  const result = { body: await response.json().catch(() => ({})), notificationId, status: response.status };
  mp.webhooks.push(result);
  return result;
}

function payPreference(preferenceId, status) {
  const preference = mp.preferences.get(preferenceId);
  const id = nextPaymentId++;
  mp.payments.set(String(id), {
    collector_id: Number(SELLER_ID), currency_id: "ARS", date_approved: status === "approved" ? new Date().toISOString() : null,
    external_reference: preference.external_reference, id, metadata: preference.metadata, status,
    transaction_amount: preference.items[0].unit_price,
  });
  return { id: String(id), preference };
}

const mercadoPago = createServer(async (req, res) => {
  const url = new URL(req.url, MP);
  const body = await readBody(req);

  if (req.method === "POST" && url.pathname === "/oauth/token") {
    const input = JSON.parse(body || "{}");
    if (input.client_id !== "client-id" || input.client_secret !== "client-secret") return send(res, 401, { error: "invalid_client" });
    const grant = input.grant_type === "authorization_code" ? mp.oauthCodes.get(input.code) : null;
    const refreshed = input.grant_type === "refresh_token" ? mp.refreshTokens.get(input.refresh_token) : null;
    if (!grant && !refreshed) return send(res, 400, { error: "invalid_grant", message: "invalid grant" });
    const access = grant?.access_token ?? refreshed;
    mp.tokens.add(access);
    return send(res, 200, { access_token: access, expires_in: 15552000, live_mode: false, refresh_token: grant?.refresh_token ?? "TG-refresh-2", user_id: Number(SELLER_ID) });
  }

  if (req.method === "POST" && url.pathname === "/checkout/preferences") {
    if (!sellerFromAuth(req)) return send(res, 401, { message: "invalid access token" });
    const input = JSON.parse(body || "{}");
    const id = `pref-${crypto.randomUUID()}`;
    mp.preferences.set(id, input);
    return send(res, 201, { id, init_point: `${MP}/checkout?pref=${id}` });
  }

  // Página de checkout simulada: dos botones (aprobar / rechazar).
  if (req.method === "GET" && url.pathname === "/checkout") {
    const pref = url.searchParams.get("pref");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>Checkout falso</title><h1>Mercado Pago (simulado)</h1>
      <form method="post" action="/checkout/pay?pref=${pref}&status=approved"><button>Pagar aprobado</button></form>
      <form method="post" action="/checkout/pay?pref=${pref}&status=rejected"><button>Pagar rechazado</button></form>`);
  }

  if (req.method === "POST" && url.pathname === "/checkout/pay") {
    const { id, preference } = payPreference(url.searchParams.get("pref"), url.searchParams.get("status"));
    await sendWebhook(id);
    const status = url.searchParams.get("status");
    const back = status === "approved" ? preference.back_urls.success : preference.back_urls.failure;
    res.writeHead(302, { location: `${back}&payment_id=${id}&collection_id=${id}&status=${status}` });
    return res.end();
  }

  const paymentMatch = url.pathname.match(/^\/v1\/payments\/(\d+)(\/refunds)?$/);
  if (paymentMatch) {
    if (!sellerFromAuth(req)) return send(res, 401, { message: "invalid access token" });
    const payment = mp.payments.get(paymentMatch[1]);
    if (!payment) return send(res, 404, { message: "Payment not found" });
    if (paymentMatch[2] && req.method === "POST") {
      payment.status = "refunded";
      const refund = { id: 900 + mp.refunds.length, payment_id: payment.id };
      mp.refunds.push(refund);
      return send(res, 201, refund);
    }
    return send(res, 200, payment);
  }

  return send(res, 404, { message: "sin ruta" });
});

// ----------------------------------------------------------------- Pruebas --

await new Promise((resolve) => supabase.listen(SUPA_PORT, resolve));
await new Promise((resolve) => mercadoPago.listen(MP_PORT, resolve));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const log = (message) => console.log(`ok - ${message}`);
const appointment = (id) => tables.appointments.find((row) => row.id === id);

function argentinaDate(daysFromToday) {
  return new Date(Date.now() + daysFromToday * 86400000).toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

async function freeSlots() {
  // Fechas de Argentina (la reserva online arranca mañana en hora local).
  const from = argentinaDate(0);
  const to = argentinaDate(20);
  const response = await fetch(`${APP}/api/public/booking/${WORKSPACE}/availability?professionalId=${OWNER}&from=${from}&to=${to}&durationMinutes=60`);
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result.slots.map((slot) => new Date(slot.start).getTime());
}

/** Primer horario libre de la reserva online (desde mañana). */
async function firstFreeSlot(skip = 0) {
  // Fechas de Argentina (la reserva online arranca mañana en hora local).
  const from = argentinaDate(0);
  const to = argentinaDate(20);
  const response = await fetch(`${APP}/api/public/booking/${WORKSPACE}/availability?professionalId=${OWNER}&from=${from}&to=${to}&durationMinutes=60`);
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result.slots[skip];
}

async function bookViaApi(slot, dni) {
  const response = await fetch(`${APP}/api/public/booking/${WORKSPACE}`, {
    body: JSON.stringify({
      documentNumber: dni, durationMinutes: 60, email: `p${dni}@paciente.test`, firstName: "Paciente", lastName: dni,
      phone: "3415550000", professionalId: OWNER, scheduledAt: slot.start,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return { body: await response.json(), status: response.status };
}

async function bookInBrowser(dni) {
  const context = await browser.newContext({ locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", viewport: { height: 900, width: 1280 } });
  const page = await context.newPage();
  await page.goto(`${APP}/reservar/${WORKSPACE}`);
  const slotButtons = page.locator("#reservar button").filter({ hasText: /^\d{2}:\d{2}$/ });
  await page.getByText("Cargando agenda...").waitFor({ state: "detached", timeout: 90000 }).catch(() => undefined);
  for (let week = 0; week < 3 && (await slotButtons.count()) === 0; week += 1) {
    await page.waitForTimeout(1500);
    if ((await slotButtons.count()) > 0) break;
    await page.getByRole("button", { name: /siguiente/i }).first().click().catch(() => undefined);
  }
  await slotButtons.first().click();
  await page.getByPlaceholder("DNI").fill(dni);
  await page.getByPlaceholder("Nombre").fill("Paciente");
  await page.getByPlaceholder("Apellido").fill(dni);
  await page.getByPlaceholder("Email").fill(`p${dni}@paciente.test`);
  await page.getByPlaceholder("Teléfono").fill("3415550000");
  await page.getByText("vas a pagar una seña de").waitFor();
  await page.screenshot({ fullPage: true, path: `${SHOTS}/reserva-con-sena.png` });
  await page.getByRole("button", { name: "Reservar y pagar seña" }).click();
  await page.getByRole("heading", { name: "Mercado Pago (simulado)" }).waitFor({ timeout: 30000 });
  return { context, page };
}

async function callStatus(appointmentId, cancelledBy) {
  const response = await fetch(`${APP}/api/appointments/status`, {
    body: JSON.stringify({ appointmentId, cancelledBy, status: "cancelled" }),
    headers: { authorization: `Bearer user-${OWNER}`, "content-type": "application/json" },
    method: "POST",
  });
  return { body: await response.json(), status: response.status };
}

let failed = false;

try {
  // 1. Flujo feliz (navegador): reserva → checkout → aprobado → turno confirmado.
  let paidId;
  {
    const { context, page } = await bookInBrowser("30111222");
    const pending = tables.appointments.at(-1);
    assert.equal(pending.status, "awaiting_payment");
    assert.equal(pending.deposit_status, "awaiting");
    assert.equal(Number(pending.deposit_amount), 5000);
    const preference = [...mp.preferences.values()].at(-1);
    assert.equal(preference.external_reference, pending.id);
    assert.equal(preference.items[0].unit_price, 5000);
    assert.equal(preference.notification_url, `${APP}/api/mercadopago/webhook`);
    assert.ok(
      !(await freeSlots()).includes(new Date(pending.scheduled_at).getTime()),
      "el horario esperando la seña aparece libre",
    );

    await page.getByRole("button", { name: "Pagar aprobado" }).click();
    await page.getByRole("heading", { name: "Turno confirmado" }).waitFor({ timeout: 30000 });
    await page.screenshot({ fullPage: true, path: `${SHOTS}/pago-aprobado.png` });
    paidId = pending.id;
    const row = appointment(paidId);
    assert.equal(row.status, "pending");
    assert.equal(row.deposit_status, "paid");
    assert.ok(row.deposit_mp_payment_id);
    const event = tables.payment_events.find((item) => item.event_id === mp.webhooks.at(-1).notificationId);
    assert.equal(event.status, "processed");
    assert.equal(event.matched_by, "deposit");
    await context.close();
    log("flujo feliz: awaiting_payment → checkout → webhook → turno confirmado (seña paid)");
  }

  // 2. Webhook duplicado: el mismo aviso y otro aviso del mismo pago no cambian nada.
  {
    const paymentId = appointment(paidId).deposit_mp_payment_id;
    const first = mp.webhooks.find((item) => item.body.outcome === "paid");
    const repeated = await sendWebhook(paymentId, first.notificationId);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.duplicate, true);
    const another = await sendWebhook(paymentId);
    assert.equal(another.body.outcome, "duplicate");
    assert.equal(appointment(paidId).deposit_status, "paid");
    log("webhook duplicado: mismo aviso = duplicate; otro aviso del mismo pago = sin cambios");
  }

  // 3. Pago rechazado (navegador): se libera el horario.
  {
    const { context, page } = await bookInBrowser("30333444");
    const pending = tables.appointments.at(-1);
    await page.getByRole("button", { name: "Pagar rechazado" }).click();
    await page.getByRole("heading", { name: "Turno no confirmado" }).waitFor({ timeout: 30000 });
    await page.getByText("El pago fue rechazado").waitFor();
    await page.screenshot({ fullPage: true, path: `${SHOTS}/pago-rechazado.png` });
    assert.equal(appointment(pending.id).status, "cancelled");
    assert.equal(appointment(pending.id).deposit_status, "rejected");
    assert.ok(
      (await freeSlots()).includes(new Date(pending.scheduled_at).getTime()),
      "el horario del pago rechazado no se liberó",
    );
    await context.close();
    log("pago rechazado: turno cancelado (rejected) y horario liberado");
  }

  // 4. Vencimiento: el cron libera el turno; un pago tardío se reembolsa.
  {
    const slot = await firstFreeSlot(3);
    const booking = await bookViaApi(slot, "30555666");
    assert.equal(booking.status, 200, JSON.stringify(booking.body));
    const id = booking.body.payment.appointmentId;
    const unauthorized = await fetch(`${APP}/api/cron/deposit-expirations`);
    assert.equal(unauthorized.status, 401);
    appointment(id).deposit_expires_at = new Date(Date.now() - 10 * 60000).toISOString();
    const cron = await fetch(`${APP}/api/cron/deposit-expirations`, { headers: { authorization: `Bearer ${CRON_SECRET}` } });
    assert.deepEqual(await cron.json(), { released: 1 });
    assert.equal(appointment(id).status, "cancelled");
    assert.equal(appointment(id).deposit_status, "expired");

    const preferenceId = appointment(id).deposit_preference_id;
    const { id: paymentId } = payPreference(preferenceId, "approved");
    const late = await sendWebhook(paymentId);
    assert.equal(late.body.outcome, "late_refund");
    assert.equal(appointment(id).deposit_status, "refunded");
    assert.ok(mp.refunds.some((refund) => String(refund.payment_id) === paymentId));
    log("vencimiento: el cron libera el horario y el pago tardío se reembolsa");
  }

  // 5a. Token por vencer: se renueva antes de cobrar.
  {
    tables.mp_connections = [connectionRow("APP_USR-seller-token", "TG-refresh-1", 5)];
    const slot = await firstFreeSlot(4);
    const booking = await bookViaApi(slot, "30777888");
    assert.ok(booking.body.payment?.checkoutUrl, JSON.stringify(booking.body));
    const connection = tables.mp_connections[0];
    assert.equal(decryptSecret(connection.access_token_encrypted, KEY), "APP_USR-refreshed-token");
    assert.ok(!JSON.stringify(connection).includes("APP_USR-"), "token sin cifrar en la base");
    assert.ok(new Date(connection.expires_at).getTime() > Date.now() + 100 * 86400000);
    log("token por vencer: se renueva con el refresh_token y queda cifrado");
  }

  // 5b. Token revocado: la reserva entra sin seña, la conexión se marca y se avisa.
  {
    mp.tokens.clear();
    tables.mp_connections = [connectionRow("APP_USR-seller-token", "TG-refresh-1", 120)];
    const slot = await firstFreeSlot(5);
    const booking = await bookViaApi(slot, "30999000");
    assert.equal(booking.status, 200, JSON.stringify(booking.body));
    assert.equal(booking.body.payment, undefined);
    const row = tables.appointments.at(-1);
    assert.equal(row.status, "pending");
    assert.equal(row.deposit_status, null);
    assert.equal(tables.mp_connections[0].status, "revoked");
    assert.ok(tables.deposit_settings[0].last_fallback_notice_at, "no se registró el aviso al profesional");
    const professionals = await (await fetch(`${APP}/api/public/booking/${WORKSPACE}/professionals`)).json();
    assert.equal(professionals.deposit, null, "con la conexión caída no se anuncia seña");
    log("token revocado: reserva sin seña, conexión revoked y aviso al profesional");
    mp.tokens.add("APP_USR-seller-token");
    tables.mp_connections = [connectionRow("APP_USR-seller-token", "TG-refresh-1", 120)];
  }

  // 6. Reembolso al cancelar el profesional; retenida si el paciente cancela tarde.
  {
    const refund = await callStatus(paidId, "professional");
    assert.equal(refund.status, 200, JSON.stringify(refund.body));
    assert.equal(refund.body.deposit.result, "refunded");
    assert.equal(appointment(paidId).deposit_status, "refunded");
    assert.equal(appointment(paidId).cancelled_by, "professional");
    assert.ok(mp.refunds.some((item) => String(item.payment_id) === appointment(paidId).deposit_mp_payment_id));

    const slot = await firstFreeSlot(6);
    const booking = await bookViaApi(slot, "31222333");
    const id = booking.body.payment.appointmentId;
    const { id: paymentId } = payPreference(appointment(id).deposit_preference_id, "approved");
    assert.equal((await sendWebhook(paymentId)).body.outcome, "paid");
    tables.deposit_settings[0].cancellation_window_hours = 168;
    const retained = await callStatus(id, "patient");
    assert.equal(retained.body.deposit.result, "retained");
    assert.equal(appointment(id).deposit_status, "retained");
    const awaiting = await bookViaApi(await firstFreeSlot(7), "31444555");
    const attended = await fetch(`${APP}/api/appointments/status`, {
      body: JSON.stringify({ appointmentId: awaiting.body.payment.appointmentId, status: "attended" }),
      headers: { authorization: `Bearer user-${OWNER}`, "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(attended.status, 409);
    log("cancelaciones: el profesional cancela → reembolso; paciente fuera de plazo → retenida");
  }

  // 7. Vinculación OAuth: state firmado + nonce en cookie.
  {
    tables.mp_connections = [];
    const start = await fetch(`${APP}/api/mercadopago/oauth/start`, { headers: { authorization: `Bearer user-${OWNER}` }, method: "POST" });
    const { url } = await start.json();
    const cookie = start.headers.get("set-cookie").split(";")[0];
    const state = new URL(url).searchParams.get("state");
    const callback = (headers) =>
      fetch(`${APP}/api/mercadopago/oauth/callback?code=code-ok&state=${encodeURIComponent(state)}`, { headers, redirect: "manual" });
    const withoutCookie = await callback({});
    assert.match(withoutCookie.headers.get("location"), /mp=error/);
    assert.equal(tables.mp_connections.length, 0);
    const ok = await callback({ cookie });
    assert.match(ok.headers.get("location"), /mp=conectado/);
    const saved = tables.mp_connections[0];
    assert.equal(saved.mp_user_id, SELLER_ID);
    assert.equal(decryptSecret(saved.access_token_encrypted, KEY), "APP_USR-oauth-token");
    assert.ok(!JSON.stringify(saved).includes("APP_USR-oauth-token"));
    log("OAuth: sin la cookie del state se rechaza; con ella guarda los tokens cifrados");
  }
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await browser.close();
  supabase.close();
  mercadoPago.close();
}

process.exit(failed ? 1 : 0);
