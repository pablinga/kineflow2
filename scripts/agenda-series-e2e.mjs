// E2E de turnos en serie y de "Registrar evolución" desde la agenda, contra el
// dev server con Supabase y las rutas /api simulados por Playwright (sin red).
//
//   NEXT_PUBLIC_SUPABASE_URL=http://supabase.test NEXT_PUBLIC_SUPABASE_ANON_KEY=fake \
//   npx next dev -p 3100 &
//   npm install --no-save playwright   # o PW_CHROMIUM=/ruta/a/chrome
//   node scripts/agenda-series-e2e.mjs
//
// Escenarios:
//   1. Clínica (admin) · "Dar turno" con serie de 4: saltea un feriado y un día
//      sin lugar, guarda los 4 en un solo insert y pide una sola confirmación.
//   2. Kinesiólogo particular · Nuevo turno con serie de 3: un insert con 3
//      turnos propios y una confirmación.
//   3. Kinesiólogo particular · Agenda vista Día: "Registrar evolución" en un
//      turno asistido guarda la evolución vinculada al turno y después muestra
//      "Evolución registrada".
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const APP = process.env.APP_URL || "http://localhost:3100";
const SHOTS = process.env.SHOTS_DIR || "/tmp/agenda-series-e2e";
mkdirSync(SHOTS, { recursive: true });

const ADMIN = "11111111-1111-4111-8111-111111111111";
const KINE = "55555555-5555-4555-8555-555555555555";
const CLINIC_WS = "22222222-2222-4222-8222-222222222222";
const PERSONAL_WS = "66666666-6666-4666-8666-666666666666";
const CLINIC = "33333333-3333-4333-8333-333333333333";
const PRO = { cp: "cp-romero", id: "44444444-0000-4000-8000-000000000001", name: "Lic. Laura Romero" };

/** Fecha "YYYY-MM-DD" en Argentina, `offset` días desde hoy. */
function arDate(offset = 0) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
}
const iso = (date, time) => new Date(`${date}T${time}:00-03:00`).toISOString();
const shift = (date, days) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const pad = (value) => String(value).padStart(2, "0");

// Serie de la clínica: arranca mañana; una semana después es feriado y a las
// dos semanas el profesional no tiene lugar.
const START = arDate(1);
const HOLIDAY = shift(START, 7);
const BUSY = shift(START, 14);

function patientRow(id, name, workspaceId) {
  return {
    assigned_professional_id: null, clinic_id: workspaceId === CLINIC_WS ? CLINIC : null, document_number: "30111222",
    email: "", full_name: name, id, initial_condition: "", insurance_member_number: null, insurance_provider_id: null,
    insurance_providers: null, phone: "11 5555-1234", phone_e164: null, status: "active", whatsapp_consent: false,
    workspace_id: workspaceId,
  };
}

function appointmentRow(overrides) {
  return {
    allows_simultaneous: false, art_provider_id: null, attention_type_id: null, attention_type_name: null,
    clinic_id: null, clinic_professional_id: null, clinic_professionals: null, clinics: null, duration_minutes: 30,
    insurance_member_number: null, insurance_provider_id: null, modality: "presencial", paid_at: null,
    payment_method: null, payment_notes: null, payment_status: "pending", payment_type: "PARTICULAR",
    reason: "Sesion", session_amount: 15000, session_number: null, signature_path: null, signed_at: null,
    treatment_id: null, workspaces: { color: "#0F55DC" }, ...overrides,
  };
}

function scenarioTables(kind) {
  if (kind === "clinic") {
    return {
      user: ADMIN,
      accountType: "CONSULTORIO",
      tables: {
        appointments: [],
        attention_types: [],
        clinic_professionals: [{ clinic_id: CLINIC, color: "#0F55DC", id: PRO.cp, professional_email: "romero@kine.test", professional_id: PRO.id, profiles: { full_name: PRO.name, license_number: null }, status: "active" }],
        clinics: [{ color: "#0F55DC", id: CLINIC, name: "Clínica Demo" }],
        patients: [patientRow("p1", "Ana Pérez", CLINIC_WS)],
        profiles: [{ account_type: "CONSULTORIO", full_name: "Admin", id: ADMIN, organization_name: "Clínica Demo", trial_ends_at: null }],
        subscriptions: [{ account_id: ADMIN, plans: { code: "CONSULTORIO" }, status: "ACTIVE", workspace_id: CLINIC_WS }],
        workspace_members: [{ role: "ADMIN", workspace_id: CLINIC_WS }],
        workspaces: [{ color: "#0F55DC", default_session_duration_minutes: 30, default_session_price: 15000, id: CLINIC_WS, max_simultaneous_appointments: 3, name: "Clínica Demo", owner_id: ADMIN, source_clinic_id: CLINIC, type: "CLINICA" }],
      },
    };
  }

  const today = arDate(0);
  // Turno particular de hace una hora, ya asistido (para la evolución).
  const attendedAt = new Date(Date.now() - 60 * 60 * 1000);
  return {
    user: KINE,
    accountType: "KINESIOLOGO",
    tables: {
      appointments: [
        appointmentRow({
          appointment_origin: "independent", id: "a-attended", owner_id: KINE, patient_id: "p1",
          patients: { full_name: "Juan Gómez" }, scheduled_at: attendedAt.toISOString(), status: "attended",
          workspace_id: PERSONAL_WS,
        }),
      ],
      attention_types: [],
      clinic_professionals: [],
      evolutions: [],
      patients: [patientRow("p1", "Juan Gómez", PERSONAL_WS)],
      profiles: [{ account_type: "KINESIOLOGO", full_name: "Pedro Kine", id: KINE, organization_name: null, trial_ends_at: null }],
      subscriptions: [{ account_id: KINE, plans: { code: "INDEPENDIENTE" }, status: "ACTIVE", workspace_id: PERSONAL_WS }],
      treatments: [],
      workspace_members: [],
      workspaces: [{ color: "#0F55DC", default_session_duration_minutes: 30, default_session_price: 15000, id: PERSONAL_WS, max_simultaneous_appointments: 1, name: "Consultorio Pedro", owner_id: KINE, source_clinic_id: null, type: "PERSONAL" }],
      _today: today,
    },
  };
}

/** Horarios libres simulados: todos los días hábiles de 8 a 20 cada 30 min. */
function freeSlots(from, to, professionalId) {
  const slots = [];
  for (let date = from; date <= to; date = shift(date, 1)) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || date === BUSY) continue;
    for (let minutes = 8 * 60; minutes < 20 * 60; minutes += 30) {
      const time = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
      const end = `${pad(Math.floor((minutes + 30) / 60))}:${pad((minutes + 30) % 60)}`;
      if (new Date(iso(date, time)) < new Date()) continue;
      slots.push({
        date, end: iso(date, end), endTime: end, start: iso(date, time), startTime: time,
        professionals: professionalId === "self" ? [] : [{ clinicProfessionalId: PRO.cp, name: PRO.name, professionalId: PRO.id }],
      });
    }
  }
  return slots;
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const log = (message) => console.log(`ok - ${message}`);

async function openScenario(kind, viewport = { height: 960, width: 1440 }) {
  const { accountType, tables, user } = scenarioTables(kind);
  const calls = { confirmations: 0, errors: [], inserts: [] };
  const context = await browser.newContext({ locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", viewport });
  const page = await context.newPage();
  page.on("pageerror", (error) => calls.errors.push(error.message));
  const session = {
    access_token: "fake", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, refresh_token: "fake", token_type: "bearer",
    user: { app_metadata: {}, aud: "authenticated", email: "user@kine.test", id: user, role: "authenticated", user_metadata: { account_type: accountType } },
  };
  await page.addInitScript((value) => window.localStorage.setItem("sb-supabase-auth-token", JSON.stringify(value)), session);

  await page.route("http://supabase.test/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/auth/v1/user")) return route.fulfill({ json: session.user });
    if (url.pathname.startsWith("/auth/v1/")) return route.fulfill({ json: session });
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      return route.fulfill({ json: url.pathname.endsWith("get_account_access_level") ? "PAID_ACTIVE" : null });
    }
    const table = url.pathname.replace("/rest/v1/", "");
    const single = (request.headers().accept ?? "").includes("vnd.pgrst.object");
    if (request.method() === "POST") {
      const rows = [JSON.parse(request.postData() ?? "{}")].flat();
      calls.inserts.push({ rows, table });
      const created = rows.map((row, index) => ({ ...row, id: `${table}-new-${calls.inserts.length}-${index}` }));
      if (table === "appointments") {
        for (const row of created) tables.appointments.push(appointmentRow({ ...row, patients: { full_name: "Paciente" } }));
      }
      if (table === "evolutions") tables.evolutions.push(...created);
      return route.fulfill({ json: single ? created[0] : created, status: 201 });
    }
    if (request.method() === "PATCH") return route.fulfill({ json: [] });
    let data = tables[table] ?? [];
    for (const [key, raw] of url.searchParams) {
      if (["select", "order", "limit", "offset", "or"].includes(key) || !data.length) continue;
      if (raw.startsWith("eq.") && key in data[0]) data = data.filter((row) => String(row[key]) === raw.slice(3));
      if (raw.startsWith("in.(")) {
        const values = raw.slice(4, -1).split(",").map((value) => value.replace(/"/g, ""));
        data = data.filter((row) => values.includes(String(row[key])));
      }
    }
    const headers = { "content-range": `0-${Math.max(data.length - 1, 0)}/${data.length}` };
    if (request.method() === "HEAD") return route.fulfill({ body: "", headers, status: 200 });
    return route.fulfill({ headers, json: single ? data[0] ?? null : data });
  });
  await page.route("**/api/appointments/availability**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const from = params.get("from");
    const to = params.get("to");
    const holidays = HOLIDAY >= from && HOLIDAY <= to ? [HOLIDAY] : [];
    route.fulfill({
      json: {
        durationMinutes: 30,
        holidays,
        slots: freeSlots(from, to, params.get("professionalId")).filter((slot) => !holidays.includes(slot.date)),
      },
    });
  });
  await page.route("**/api/appointments/confirm-notification", (route) => {
    calls.confirmations += 1;
    route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/appointments/status", (route) => route.fulfill({ json: { ok: true } }));
  await page.route("**/api/push/**", (route) => route.fulfill({ json: {} }));
  return { calls, context, page, tables };
}

try {
  // 1. Clínica · Dar turno con serie
  {
    const { calls, context, page } = await openScenario("clinic");
    await page.goto(`${APP}/dashboard/turnos`);
    await page.getByText("Dar y ver turnos").waitFor({ timeout: 90_000 });
    // Día del primer turno en el calendario ("jueves, 23 de octubre: ...").
    const startDay = Number(START.slice(8));
    if (START.slice(0, 7) !== arDate(0).slice(0, 7)) await page.getByRole("button", { name: "Mes siguiente" }).click();
    await page.getByRole("button", { name: new RegExp(`, ${startDay} de `) }).first().click();
    await page.getByRole("button", { name: "Dar turno" }).first().waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Dar turno" }).first().click();
    await page.getByPlaceholder("Nombre, DNI o teléfono").fill("ana");
    await page.getByRole("button", { name: /Ana Pérez/ }).click();
    await page.getByText("Repetir este turno").click();
    await page.getByLabel("Cantidad de turnos (incluye este)").fill("4");
    await page.getByText(/Se van a dar 4 turnos/).waitFor({ timeout: 20_000 });
    const skipped = await page.getByText(/^Salteados:/).textContent();
    assert.ok(skipped.includes("(feriado)") && skipped.includes("(sin lugar)"), `salteados: ${skipped}`);
    await page.screenshot({ path: `${SHOTS}/1-clinica-serie.png` });
    await page.getByRole("button", { name: "Guardar turno" }).click();
    await page.getByText(/4 turnos dados: Ana Pérez/).waitFor({ timeout: 15_000 });

    const appointmentInserts = calls.inserts.filter((insert) => insert.table === "appointments");
    assert.equal(appointmentInserts.length, 1, "la serie debe guardarse en un solo insert");
    const dates = appointmentInserts[0].rows.map((row) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(row.scheduled_at)));
    assert.equal(dates.length, 4);
    assert.equal(dates[0], START);
    assert.ok(!dates.includes(HOLIDAY) && !dates.includes(BUSY), `fechas: ${dates.join(", ")}`);
    assert.equal(new Set(appointmentInserts[0].rows.map((row) => row.owner_id)).size, 1);
    assert.ok(appointmentInserts[0].rows.every((row) => row.appointment_origin === "clinic" && row.clinic_professional_id === PRO.cp));
    await page.waitForTimeout(500);
    assert.equal(calls.confirmations, 1, "una sola confirmación por WhatsApp");
    assert.deepEqual(calls.errors, []);
    log(`clínica: serie de 4 (${dates.join(", ")}) salteando feriado y día sin lugar, un insert y una confirmación`);
    await context.close();
  }

  // 2. Particular · Nuevo turno con serie
  {
    const { calls, context, page } = await openScenario("personal");
    await page.goto(`${APP}/dashboard/turnos/nuevo?paciente=p1`);
    await page.getByText("Horarios disponibles", { exact: true }).waitFor({ timeout: 90_000 });
    const slot = page.getByRole("button", { name: /^\d{2}:\d{2}/ }).first();
    // Si la semana actual ya no tiene horarios (fin de semana, de noche), la siguiente.
    await Promise.race([
      slot.waitFor({ timeout: 20_000 }),
      page.getByRole("button", { name: "Ver semana siguiente" }).waitFor({ timeout: 20_000 }),
    ]);
    if (!(await slot.isVisible())) await page.getByRole("button", { name: "Ver semana siguiente" }).click();
    await slot.waitFor({ timeout: 20_000 });
    await slot.click();
    await page.getByText("Repetir este turno").click();
    await page.getByLabel("Cantidad de turnos (incluye este)").fill("3");
    await page.getByText(/Se van a dar 3 turnos/).waitFor({ timeout: 20_000 });
    await page.screenshot({ fullPage: true, path: `${SHOTS}/2-particular-serie.png` });
    await page.getByRole("button", { name: "Guardar turno" }).click();
    await page.waitForURL(/\/dashboard\/pacientes\/p1/, { timeout: 20_000 });

    const appointmentInserts = calls.inserts.filter((insert) => insert.table === "appointments");
    assert.equal(appointmentInserts.length, 1);
    const rows = appointmentInserts[0].rows;
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.owner_id === KINE && row.workspace_id === PERSONAL_WS && row.appointment_origin === "independent"));
    assert.equal(new Set(rows.map((row) => row.scheduled_at.slice(11))).size, 1, "todos a la misma hora");
    await page.waitForTimeout(500);
    assert.equal(calls.confirmations, 1);
    log("particular: Nuevo turno con serie de 3, un insert y una confirmación");
    await context.close();
  }

  // 3. Particular · Agenda vista Día · Registrar evolución
  {
    const { calls, context, page, tables } = await openScenario("personal");
    await page.goto(`${APP}/dashboard/turnos?vista=dia`);
    const register = page.getByRole("button", { name: "Registrar evolución" }).first();
    await register.waitFor({ timeout: 90_000 });
    await register.click();
    await page.getByText("Registrar evolución").last().waitFor();
    await page.locator("form textarea").first().fill("Movilidad de hombro y ejercicios de fortalecimiento.");
    await page.screenshot({ path: `${SHOTS}/3-evolucion-modal.png` });
    await page.getByRole("button", { name: "Guardar evolución" }).click();
    await page.getByText("Evolución registrada").first().waitFor({ timeout: 15_000 });

    const evolutionInserts = calls.inserts.filter((insert) => insert.table === "evolutions");
    assert.equal(evolutionInserts.length, 1);
    const evolution = evolutionInserts[0].rows[0];
    assert.equal(evolution.appointment_id, "a-attended");
    assert.equal(evolution.patient_id, "p1");
    assert.equal(evolution.workspace_id, PERSONAL_WS);
    assert.equal(evolution.owner_id, KINE);
    assert.ok(evolution.clinical_notes.startsWith("Movilidad"));
    assert.equal(tables.evolutions.length, 1);
    assert.deepEqual(calls.errors, []);
    log("particular: Registrar evolución desde la vista Día, vinculada al turno, y después 'Evolución registrada'");
    await context.close();
  }

  console.log("agenda-series e2e: todo ok");
} finally {
  await browser.close();
}
