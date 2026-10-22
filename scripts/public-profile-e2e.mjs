// E2E del perfil público (/reservar/[workspaceId]) y de la pestaña "Perfil
// público" de Configuración, contra el dev server y un Supabase falso en
// memoria que levanta este mismo script (puerto 54331). Playwright temporal:
//
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54331 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake-anon \
//   SUPABASE_SERVICE_ROLE_KEY=fake-service NEXT_PUBLIC_APP_URL=http://localhost:3100 \
//   npx next dev -p 3100 &
//   npm install --no-save playwright   # o PW_CHROMIUM=/ruta/a/chrome
//   node scripts/public-profile-e2e.mjs
//
// El Supabase falso imita los permisos por columna de la migración
// 202610210001: con la clave anónima, workspace_public_profiles solo deja
// leer las columnas del perfil (pedir otra devuelve 401, como Postgres).
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";

const APP = process.env.APP_URL || "http://localhost:3100";
const PORT = 54331;
const SHOTS = process.env.SHOTS_DIR || "/tmp/public-profile-e2e";
mkdirSync(SHOTS, { recursive: true });

const OWNER = "11111111-1111-4111-8111-111111111111";
const W_FULL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const W_CLINIC = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const W_NEW = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NEW_OWNER = "22222222-2222-4222-8222-222222222222";
const CLINIC_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

// Datos de pacientes que nunca deben aparecer en la página pública.
const PATIENT_SECRETS = ["Paciente Secreto", "30999888", "1155550000", "secreto@paciente.test"];

const ANON_PROFILE_COLUMNS = new Set([
  "workspace_id", "treatments", "insurance_notes", "home_visits", "bio",
  "public_address", "locality_id", "license_number",
]);

const workspaceBase = {
  color: "#0b97dc", default_session_duration_minutes: 45, default_session_price: 30000,
  email: "consultorio@kine.test", max_simultaneous_appointments: 1, min_booking_notice_hours: 0, phone: "341 555 0000",
  responsible_name: null, created_at: "2026-01-01T00:00:00Z",
};

function seed() {
  return {
    acquisition_events: [],
    ar_localities: [
      { display_name: "Rosario", id: "82084270", label: "Rosario, Santa Fe", name: "Rosario", province_name: "Santa Fe", search_text: "rosario" },
      { display_name: "Rosales", id: "14182090", label: "Rosales, Córdoba", name: "Rosales", province_name: "Córdoba", search_text: "rosales" },
      { display_name: "CABA", id: "02014010", label: "Ciudad Autónoma de Buenos Aires (CABA)", name: "Ciudad Autónoma de Buenos Aires", province_name: "Ciudad Autónoma de Buenos Aires", search_text: "ciudad autonoma de buenos aires caba capital federal" },
    ],
    appointments: [{ id: "ap1", patient_id: "pa1", workspace_id: W_FULL, owner_id: OWNER, scheduled_at: "2026-10-22T13:00:00Z", status: "pending" }],
    clinic_professionals: [],
    independent_availability: [],
    insurance_providers: [
      { active: true, id: "i1", name: "OSDE", session_price: null, workspace_id: W_FULL },
      { active: false, id: "i2", name: "Inactiva", session_price: null, workspace_id: W_FULL },
    ],
    patients: [{ document_number: "30999888", email: "secreto@paciente.test", full_name: "Paciente Secreto", id: "pa1", phone: "1155550000", workspace_id: W_FULL }],
    profiles: [
      { account_type: "KINESIOLOGO", email: "laura@kine.test", full_name: "Laura Gómez", id: OWNER, license_number: "MP 999", organization_name: null, trial_ends_at: null },
      { account_type: "KINESIOLOGO", email: "nuevo@kine.test", full_name: "Pedro Nuevo", id: NEW_OWNER, license_number: "MN 5555", organization_name: null, trial_ends_at: null },
    ],
    subscriptions: [],
    workspace_members: [
      { role: "ADMIN", status: "accepted", user_id: OWNER, workspace_id: W_FULL },
      { role: "ADMIN", status: "accepted", user_id: NEW_OWNER, workspace_id: W_NEW },
    ],
    workspace_public_profiles: [{
      bio: "Kinesióloga deportiva. Trabajo con ejercicio terapéutico.", locality_id: "82084270", home_visits: true,
      insurance_notes: "Reintegros de prepagas", license_number: "MP 1234", listed_in_directory: true, listed_in_directory_at: "2026-10-21T00:00:00Z",
      public_address: "Corrientes 123", treatments: ["deportiva", "rpg"], workspace_id: W_FULL,
    }],
    workspaces: [
      { ...workspaceBase, address: "Corrientes 123", id: W_FULL, name: "Consultorio Laura", owner_id: OWNER, source_clinic_id: null, type: "PERSONAL" },
      { ...workspaceBase, address: null, id: W_CLINIC, name: "Centro Kine Sur", owner_id: "33333333-3333-4333-8333-333333333333", source_clinic_id: CLINIC_ID, type: "CLINICA" },
      { ...workspaceBase, address: "San Martín 50", id: W_NEW, name: "Consultorio Pedro", owner_id: NEW_OWNER, source_clinic_id: null, type: "PERSONAL" },
    ],
  };
}

let tables = seed();
const requests = [];

function matches(row, key, raw) {
  const negate = raw.startsWith("not.");
  const expr = negate ? raw.slice(4) : raw;
  const [op, ...rest] = expr.split(".");
  const value = rest.join(".");
  const cell = row[key];
  let ok;
  if (op === "eq") ok = String(cell) === value;
  else if (op === "neq") ok = String(cell) !== value;
  else if (op === "is") ok = value === "null" ? cell === null || cell === undefined : String(cell) === value;
  else if (op === "in") ok = value.replace(/^\(|\)$/g, "").split(",").includes(String(cell));
  else if (["gte", "lte", "gt", "lt", "ilike", "like", "cs", "ov"].includes(op)) ok = true;
  else ok = true;
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
    } else {
      current += char;
    }
  }
  if (current.trim()) columns.push(current.trim());
  return columns.map((column) => column.split("(")[0].split(":").pop().trim());
}

function project(rows, select) {
  if (!select || select === "*") return rows;
  const columns = topLevelColumns(select);
  return rows.map((row) => Object.fromEntries(columns.map((column) => [
    column,
    // Embed por FK: ar_localities(...) desde locality_id.
    column === "ar_localities"
      ? tables.ar_localities.find((locality) => locality.id === row.locality_id) ?? null
      : column === "workspaces" && row.workspace_id
        ? tables.workspaces.find((workspace) => workspace.id === row.workspace_id) ?? null
        : row[column] ?? null,
  ])));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const session = (userId) => ({
  access_token: `user-${userId}`, expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, refresh_token: "r", token_type: "bearer",
  user: { app_metadata: {}, aud: "authenticated", email: "x@kine.test", id: userId, role: "authenticated", user_metadata: { account_type: "KINESIOLOGO" } },
});

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString();
  const auth = req.headers.authorization ?? "";
  const role = auth === "Bearer fake-service" ? "service" : auth.startsWith("Bearer user-") ? "user" : "anon";
  requests.push({ method: req.method, path: url.pathname, role, search: url.search });

  if (url.pathname.startsWith("/auth/v1/user")) {
    return send(res, 200, session(auth.replace("Bearer user-", "")).user);
  }
  if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, session(OWNER));
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = url.pathname.split("/").pop();
    if (fn === "search_ar_localities") {
      const query = String(JSON.parse(body || "{}").query ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const found = query.length < 3 ? [] : tables.ar_localities.filter((row) => row.search_text.split(" ").some((word) => word.startsWith(query)));
      return send(res, 200, found.map(({ display_name, id, label, province_name }) => ({ display_name, id, label, province_name })));
    }
    return send(res, 200, fn === "get_account_access_level" ? "PAID_ACTIVE" : null);
  }

  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (!table) return send(res, 404, { message: "sin ruta" });
  tables[table] ??= [];
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const select = url.searchParams.get("select");

  // Permisos por columna de la clave anónima (como el grant de la migración).
  if (table === "workspace_public_profiles" && role === "anon") {
    if (req.method !== "GET") return send(res, 401, { code: "42501", message: "permission denied" });
    const asked = topLevelColumns(select ?? "*");
    if (asked.includes("*") || asked.some((column) => !ANON_PROFILE_COLUMNS.has(column))) {
      return send(res, 401, { code: "42501", message: `permission denied for column` });
    }
  }
  // Sin sesión no se leen tablas con datos de pacientes ni del espacio
  // (el maestro de localidades es público).
  if (role === "anon" && !["workspace_public_profiles", "ar_localities"].includes(table)) {
    return send(res, 200, single ? null : []);
  }

  // RLS mínima para usuarios logueados: sus espacios y su perfil público.
  const userId = auth.replace("Bearer user-", "");
  const visible = (rows) => {
    if (role !== "user") return rows;
    const memberOf = new Set(tables.workspace_members.filter((m) => m.user_id === userId).map((m) => m.workspace_id));
    if (table === "workspaces") return rows.filter((row) => memberOf.has(row.id));
    if (table === "workspace_public_profiles") {
      return rows.filter((row) => tables.workspaces.some((w) => w.id === row.workspace_id && w.owner_id === userId));
    }
    return rows;
  };
  if (role === "user" && table === "workspace_public_profiles" && req.method === "POST") {
    const rows = [JSON.parse(body || "{}")].flat();
    if (!rows.every((row) => tables.workspaces.some((w) => w.id === row.workspace_id && w.owner_id === userId))) {
      return send(res, 403, { code: "42501", message: "new row violates row-level security policy" });
    }
  }

  const finish = (rows) => {
    const projected = project(rows, select);
    if (single) return projected.length ? send(res, 200, projected[0]) : send(res, 406, { code: "PGRST116", message: "0 rows" });
    return send(res, 200, projected, { "content-range": `0-${Math.max(projected.length - 1, 0)}/${projected.length}` });
  };

  if (req.method === "GET" || req.method === "HEAD") {
    let rows = visible(filterRows(tables[table], url.searchParams));
    const limit = Number(url.searchParams.get("limit") || 0);
    if (limit) rows = rows.slice(0, limit);
    return finish(rows);
  }

  if (req.method === "POST") {
    const payload = JSON.parse(body || "{}");
    const rows = Array.isArray(payload) ? payload : [payload];
    const prefer = req.headers.prefer ?? "";
    const conflict = url.searchParams.get("on_conflict");
    const saved = rows.map((row) => {
      if (conflict) {
        const keys = conflict.split(",");
        const existing = tables[table].find((item) => keys.every((key) => String(item[key]) === String(row[key])));
        if (existing) {
          if (!prefer.includes("ignore-duplicates")) Object.assign(existing, row);
          return existing;
        }
      }
      const created = table === "workspace_public_profiles"
        ? { home_visits: false, listed_in_directory: false, treatments: [], ...row }
        : { id: tables[table].length + 1, ...row };
      tables[table].push(created);
      return created;
    });
    return prefer.includes("return=representation") ? finish(saved) : send(res, 201);
  }

  if (req.method === "PATCH") {
    const patch = JSON.parse(body || "{}");
    const rows = filterRows(tables[table], url.searchParams);
    rows.forEach((row) => Object.assign(row, patch));
    return (req.headers.prefer ?? "").includes("return=representation") ? finish(rows) : send(res, 204);
  }

  return send(res, 405, { message: "método no soportado" });
});

await new Promise((resolve) => server.listen(PORT, resolve));
const log = (message) => console.log(`ok - ${message}`);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function newPage(viewport = { height: 900, width: 1280 }) {
  const context = await browser.newContext({ locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", viewport });
  const page = await context.newPage();
  const responses = [];
  page.on("response", async (response) => {
    if (response.url().startsWith(APP)) {
      responses.push({ body: await response.text().catch(() => ""), url: response.url() });
    }
  });
  return { context, page, responses };
}

function assertNoSecrets(text, where) {
  for (const secret of [...PATIENT_SECRETS, "listed_in_directory", "laura@kine.test"]) {
    assert.ok(!text.includes(secret), `${where} expone "${secret}"`);
  }
}

try {
  // 1. Perfil completo
  {
    const { context, page, responses } = await newPage({ height: 844, width: 390 });
    await page.goto(`${APP}/reservar/${W_FULL}`);
    await page.getByRole("heading", { level: 1, name: "Lic. Laura Gómez" }).waitFor({ timeout: 90000 });
    await page.getByText("Reservá tu turno").waitFor();
    assert.equal(await page.title(), "Lic. Laura Gómez — Kinesiología en Rosario");
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "index, follow");
    assert.equal(await page.locator('meta[property="og:title"]').getAttribute("content"), "Lic. Laura Gómez — Kinesiología en Rosario");
    assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).startsWith("Kinesióloga deportiva"));
    const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    assert.equal(jsonLd["@type"], "Physician");
    assert.equal(jsonLd.address.addressLocality, "Rosario");
    assert.equal(jsonLd.address.addressRegion, "Santa Fe");
    for (const text of ["Deportiva", "RPG", "Atiende a domicilio", "Matrícula MP 1234", "Corrientes 123, Rosario, Santa Fe", "OSDE · Reintegros de prepagas"]) {
      await page.getByText(text, { exact: false }).first().waitFor();
    }
    assert.equal(await page.getByText("Inactiva").count(), 0, "muestra una obra social inactiva");
    await page.waitForTimeout(1500);
    await page.screenshot({ fullPage: true, path: `${SHOTS}/perfil-completo-mobile.png` });

    const footer = page.getByTestId("profile-footer-link");
    assert.equal(await footer.getAttribute("href"), "/?utm_campaign=perfil_publico&utm_medium=footer&utm_source=perfil");
    await page.getByText("Agenda con KineFlow").waitFor();
    log("perfil completo: datos, SEO, schema.org Physician y link del pie");

    const html = await page.content();
    assertNoSecrets(html, "el HTML del perfil");
    for (const response of responses) assertNoSecrets(response.body, response.url);
    log("el perfil y las respuestas de la API no exponen pacientes ni el consentimiento");

    // Vista registrada una sola vez por sesión, aunque recargue.
    await page.reload();
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.waitForTimeout(1500);
    const views = tables.acquisition_events.filter((event) => event.event_type === "profile_view");
    assert.equal(views.length, 1, `profile_view: ${views.length}`);
    assert.equal(views[0].utm_source, "perfil");
    assert.equal(views[0].utm_content, W_FULL);
    assert.equal(views[0].landing_page, `/reservar/${W_FULL}`);

    await footer.click();
    await page.waitForURL(/utm_source=perfil/);
    await page.waitForTimeout(1500);
    const clicks = tables.acquisition_events.filter((event) => event.event_type === "profile_footer_click");
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].utm_medium, "footer");
    assert.equal(clicks[0].utm_campaign, "perfil_publico");
    const url = new URL(page.url());
    assert.equal(url.pathname, "/");
    assert.equal(url.searchParams.get("utm_source"), "perfil");
    assert.equal(url.searchParams.get("utm_medium"), "footer");
    assert.equal(url.searchParams.get("utm_campaign"), "perfil_publico");
    await page.locator("#buscador").scrollIntoViewIfNeeded();
    await page.locator("#buscador").screenshot({ path: `${SHOTS}/landing-buscador-mobile.png` });
    log("eventos profile_view (una vez) y profile_footer_click; el pie lleva a la landing con el UTM");
    await context.close();
  }

  // 2. Clínica sin perfil cargado: sin datos opcionales y sin indexar
  {
    const { context, page } = await newPage();
    await page.goto(`${APP}/reservar/${W_CLINIC}`);
    await page.getByRole("heading", { level: 1, name: "Centro Kine Sur" }).waitFor({ timeout: 60000 });
    assert.equal(await page.title(), "Centro Kine Sur — Kinesiología");
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, follow");
    const jsonLd = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    assert.equal(jsonLd["@type"], "MedicalClinic");
    for (const text of ["Tratamientos", "Obras sociales", "Matrícula", "Atiende a domicilio"]) {
      assert.equal(await page.getByText(text, { exact: true }).count(), 0, `muestra "${text}" sin datos`);
    }
    await page.getByText("Reservá tu turno").waitFor();
    await page.waitForTimeout(1000);
    await page.screenshot({ fullPage: true, path: `${SHOTS}/perfil-vacio-desktop.png` });
    log("clínica sin perfil: carga, sin datos opcionales, noindex y MedicalClinic");
    await context.close();
  }

  // 3. Link inválido: la página no se rompe y no se indexa
  {
    const { context, page } = await newPage();
    await page.goto(`${APP}/reservar/no-existe`);
    await page.getByText("Agenda con KineFlow").waitFor({ timeout: 60000 });
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex, nofollow");
    log("link inválido: sin perfil, noindex");
    await context.close();
  }

  // 4. Configuración → Perfil público: opt-in apagado por defecto
  {
    const { context, page } = await newPage();
    await page.addInitScript((value) => {
      window.localStorage.setItem("sb-localhost-auth-token", JSON.stringify(value));
    }, session(NEW_OWNER));
    await page.goto(`${APP}/dashboard/configuracion#perfil`);
    const optIn = page.getByTestId("listed-in-directory");
    await optIn.waitFor({ timeout: 90000 });
    assert.equal(await optIn.isChecked(), false, "el opt-in arranca marcado");
    // Precarga de la dirección del espacio y la matrícula del profesional.
    assert.equal(await page.getByPlaceholder("Calle y número, o solo el barrio").inputValue(), "San Martín 50");
    await page.getByRole("button", { name: "RPG" }).click();
    await page.getByPlaceholder(/Contá tu experiencia/).fill("Kinesiólogo respiratorio.");
    // Ciudad: sugerencias desde 3 letras; no se guarda texto libre.
    const cityInput = page.getByRole("combobox");
    await cityInput.fill("ro");
    await page.waitForTimeout(600);
    assert.equal(await page.getByRole("option").count(), 0, "sugiere con menos de 3 letras");
    await cityInput.fill("ros");
    await page.getByRole("option", { name: "Rosario, Santa Fe" }).waitFor();
    await page.screenshot({ fullPage: true, path: `${SHOTS}/configuracion-ciudad.png` });
    await page.getByRole("option", { name: "Rosario, Santa Fe" }).click();
    await page.getByText("San Martín 50, Rosario, Santa Fe").waitFor();
    await page.getByRole("heading", { level: 2, name: "Lic. Pedro Nuevo" }).waitFor();
    await page.screenshot({ fullPage: true, path: `${SHOTS}/configuracion-perfil.png` });
    await page.getByRole("button", { name: "Guardar perfil" }).click();
    await page.getByText("Perfil guardado.").waitFor();
    const saved = tables.workspace_public_profiles.find((row) => row.workspace_id === W_NEW);
    assert.equal(saved.listed_in_directory, false);
    assert.deepEqual(saved.treatments, ["rpg"]);
    assert.equal(saved.locality_id, "82084270");
    assert.equal(saved.city, null);
    assert.equal(saved.license_number, "MN 5555");
    log("Configuración: opt-in en false por defecto, guarda el perfil y la vista previa");
    await context.close();
  }

  // 5. llms.txt, sitemap y robots
  {
    const llms = await (await fetch(`${APP}/llms.txt`)).text();
    assert.ok(llms.startsWith("# KineFlow"), "llms.txt sin título");
    assert.ok(llms.includes("## Planes") && llms.includes("Reservas online"));
    assert.ok(
      llms.includes(`- [Lic. Laura Gómez](${APP}/reservar/${W_FULL}): Kinesiología · Rosario, Santa Fe · tratamientos: RPG, Deportiva · atiende a domicilio.`),
      "falta el perfil que aceptó el buscador",
    );
    assert.ok(!llms.includes("Pedro Nuevo"), "lista un perfil sin consentimiento");
    assert.ok(!llms.includes("Kinesióloga deportiva"), "publica la bio");
    assertNoSecrets(llms, "llms.txt");
    const sitemap = await (await fetch(`${APP}/sitemap.xml`)).text();
    assert.ok(sitemap.includes(`${APP}/reservar/${W_FULL}`));
    assert.ok(sitemap.includes(`${APP}/reservar/${W_NEW}`), "falta el perfil completado en Configuración");
    assert.ok(!sitemap.includes(W_CLINIC), "incluye un perfil vacío");
    assert.ok(sitemap.includes(`<loc>${APP}</loc>`) && sitemap.includes(`${APP}/registro`));
    const robots = await (await fetch(`${APP}/robots.txt`)).text();
    assert.ok(robots.includes(`Sitemap: ${APP}/sitemap.xml`));
    assert.ok(!/Disallow: \/\s*$/m.test(robots), "robots bloquea todo en local");
    log("llms.txt solo con perfiles que aceptaron el buscador; sitemap sin perfiles vacíos; robots con sitemap");
  }

  console.log("public-profile e2e: todo ok");
} finally {
  await browser.close();
  server.close();
}
