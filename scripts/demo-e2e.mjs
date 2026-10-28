// E2E de la demo pública (/demo): carga con datos ficticios, CTA que conserva
// los UTM y ninguna llamada a Supabase ni a APIs de datos (la única llamada
// permitida es POST /api/acquisition/event con demo_view).
//
// Requiere la app corriendo y Playwright instalado temporalmente:
//   npm install --no-save playwright && npx playwright install chromium
//   set -a; source .env.qa.local; set +a
//   APP_URL=http://localhost:3000 npm run test:demo:e2e
//   npm uninstall playwright
// Con NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (QA) verifica
// además las filas demo_view en acquisition_events y las borra al final.
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

const appUrl = process.env.APP_URL?.replace(/\/$/, "");

if (!appUrl) {
  console.error("Definí APP_URL (por ejemplo http://localhost:3000).");
  process.exit(1);
}

const admin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;
const runId = Date.now().toString(36);
const campaign = `e2e_demo_${runId}`;
const visitorIds = [];
let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) {
    failures += 1;
  }

  console.log(`${condition ? "ok" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

/** Registra los pedidos de la página para revisar que no lea datos reales. */
function recordRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    requests.push({ method: request.method(), postData: request.postData(), url: request.url() });
  });
  return requests;
}

function checkNoDataRequests(label, requests) {
  const appOrigin = new URL(appUrl).origin;
  const forbidden = requests.filter(({ method, url }) => {
    const parsed = new URL(url);

    if (/supabase/i.test(parsed.host) || /\/(rest|auth|storage|realtime|functions)\/v1\//.test(parsed.pathname)) {
      return true;
    }

    if (parsed.origin === appOrigin && parsed.pathname.startsWith("/api/")) {
      return !(method === "POST" && parsed.pathname === "/api/acquisition/event");
    }

    return false;
  });

  check(
    `${label}: sin llamadas a Supabase ni a APIs de datos`,
    forbidden.length === 0,
    forbidden.map((request) => `${request.method} ${request.url}`).join(", "),
  );
}

function demoViewPosts(requests) {
  return requests
    .filter(({ method, url }) => method === "POST" && new URL(url).pathname === "/api/acquisition/event")
    .map(({ postData }) => JSON.parse(postData ?? "{}"))
    .filter((body) => body.eventType === "demo_view");
}

const browser = await chromium.launch();

try {
  // 1. Carga de /demo en el celular, sin UTM.
  {
    const context = await browser.newContext({ ...devices["iPhone 13"] });
    const page = await context.newPage();
    const requests = recordRequests(page);
    const eventResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/acquisition/event",
      { timeout: 20000 },
    );

    const response = await page.goto(`${appUrl}/demo`);
    check("/demo responde 200", response?.status() === 200, String(response?.status()));
    await page.getByTestId("demo-agenda").waitFor({ timeout: 20000 });
    check("muestra el aviso de datos ficticios", await page.getByText("turnos ficticios", { exact: false }).first().isVisible());

    // Busca un día de la semana con turnos (hoy puede ser domingo).
    let rows = await page.locator('[data-testid="demo-agenda"] li').count();
    if (rows === 0) {
      await page.getByRole("button", { name: /lunes/i }).first().click();
      rows = await page.locator('[data-testid="demo-agenda"] li').count();
    }
    check("la agenda muestra turnos ficticios", rows > 0, `${rows} turnos`);

    await page.getByRole("button", { name: /Acciones del turno de/ }).first().click();
    check("las acciones abren el aviso de demo (solo lectura)", await page.getByTestId("demo-notice").isVisible());
    await page.getByRole("button", { name: "Cerrar" }).click();

    await page.getByRole("tab", { name: "Pacientes" }).click();
    const cards = await page.locator('[data-testid="demo-patients"] article').count();
    check("pacientes muestra las tarjetas ficticias", cards === 8, `${cards} tarjetas`);
    await page.getByPlaceholder("Buscar por nombre o DNI").fill("lucia");
    check("la búsqueda filtra en el navegador", (await page.locator('[data-testid="demo-patients"] article').count()) === 1);

    const event = await eventResponse.catch(() => null);
    const posts = demoViewPosts(requests);
    check("registra un demo_view", posts.length === 1, `${posts.length} envíos`);
    check("demo_view sin UTM va como utm_source=demo", posts[0]?.attribution?.utm_source === "demo" && posts[0]?.attribution?.landing_page === "/demo");
    check("la API acepta demo_view", event?.status() === 200, String(event?.status()));
    visitorIds.push(posts[0]?.visitorId);

    await page.reload();
    await page.getByTestId("demo-agenda").waitFor();
    await page.waitForTimeout(1000);
    check("un solo demo_view por sesión", demoViewPosts(requests).length === 1);

    checkNoDataRequests("/demo sin UTM", requests);
    await context.close();
  }

  // 2. Con UTM: el CTA lleva los UTM a /registro.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const requests = recordRequests(page);
    const utm = `utm_source=instagram&utm_medium=social&utm_campaign=${campaign}`;

    await page.goto(`${appUrl}/demo?${utm}&utm_content=juan@mail.com`);
    await page.getByTestId("demo-agenda").waitFor({ timeout: 20000 });
    const cta = page.getByTestId("demo-cta");
    check("el CTA dice 'Probar 3 meses gratis'", (await cta.innerText()).trim() === "Probar 3 meses gratis");
    await page.waitForFunction(
      () => document.querySelector('[data-testid="demo-cta"]')?.getAttribute("href") !== "/registro",
    );
    const href = await cta.getAttribute("href");
    check("el CTA conserva los UTM (y descarta el email)", href === `/registro?${utm}`, href ?? "");

    await page.waitForTimeout(1000);
    const posts = demoViewPosts(requests);
    check("demo_view con UTM cuenta para la campaña", posts[0]?.attribution?.utm_campaign === campaign);
    visitorIds.push(posts[0]?.visitorId);
    checkNoDataRequests("/demo con UTM", requests);

    await cta.click();
    await page.waitForURL(/\/registro\?/);
    const landed = new URL(page.url());
    check(
      "el clic llega a /registro con los UTM",
      landed.pathname === "/registro" && landed.searchParams.get("utm_campaign") === campaign,
      landed.pathname + landed.search,
    );
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kineflow.attribution.v1") ?? "null"));
    check("la atribución queda guardada para el registro", stored?.utm_campaign === campaign);
    await context.close();
  }

  // 3. La API rechaza un demo_view que no viene de /demo.
  {
    const context = await browser.newContext();
    const response = await context.request.post(`${appUrl}/api/acquisition/event`, {
      data: {
        attribution: { first_visited_at: new Date().toISOString(), landing_page: "/", utm_source: "demo" },
        eventType: "demo_view",
        visitorId: crypto.randomUUID(),
      },
    });
    check("la API rechaza demo_view fuera de /demo", response.status() === 400, String(response.status()));
    await context.close();
  }

  // 4. Filas en la base (solo con credenciales de QA).
  if (admin) {
    const ids = visitorIds.filter(Boolean);
    const { data, error } = await admin
      .from("acquisition_events")
      .select("event_type, utm_source, utm_campaign, landing_page")
      .in("visitor_id", ids)
      .eq("event_type", "demo_view");
    check("acquisition_events tiene los dos demo_view", !error && data?.length === 2, error?.message ?? `${data?.length} filas`);
    check(
      "una fila directa y una de la campaña, las dos en /demo",
      data?.some((row) => row.utm_source === "demo") &&
        data?.some((row) => row.utm_campaign === campaign) &&
        data?.every((row) => row.landing_page === "/demo"),
    );
  } else {
    console.log("skip - sin credenciales de QA no se revisan las filas en la base");
  }
} finally {
  await browser.close();

  if (admin) {
    const ids = visitorIds.filter(Boolean);
    const { error } = ids.length
      ? await admin.from("acquisition_events").delete().in("visitor_id", ids)
      : { error: null };
    console.log(error ? `limpieza: error ${error.message}` : "limpieza: ok");
  }
}

console.log(failures === 0 ? "\ndemo e2e: todo ok" : `\ndemo e2e: ${failures} fallas`);
process.exit(failures === 0 ? 0 : 1);
