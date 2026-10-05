// E2E de atribución: landing con UTM → navegación → visita sin UTM →
// registro por el formulario real → usuario creado con la atribución asociada.
//
// Requiere la app corriendo y Playwright instalado temporalmente:
//   npm install --no-save playwright && npx playwright install chromium
//   set -a; source .env.qa.local; set +a
//   APP_URL=http://localhost:3000 node scripts/attribution-e2e.mjs
//   npm uninstall playwright
// Supabase rechaza emails @example.com en el registro público y un email real
// recibiría el mail de confirmación. Por eso el pedido de signUp que arma el
// formulario se intercepta: se verifica que lleve la atribución y el usuario se
// crea con ese MISMO payload vía la API admin (sin mail). El trigger de la base
// es el mismo en los dos caminos. Borra todo lo que crea.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const appUrl = process.env.APP_URL;
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

if (!appUrl) {
  console.error("Definí APP_URL (por ejemplo http://localhost:3000).");
  process.exit(1);
}

const runId = Date.now().toString(36);
const campaign = `e2e_attr_${runId}`;
const email = `attr-e2e-${runId}@example.com`;
let failures = 0;
let userId = null;
let visitorId = null;

function check(name, condition, detail = "") {
  if (!condition) {
    failures += 1;
  }

  console.log(`${condition ? "ok" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

const browser = await chromium.launch();

try {
  const page = await (await browser.newContext()).newPage();

  // 1. Landing con UTM.
  await page.goto(
    `${appUrl}/?utm_source=email&utm_medium=outreach&utm_campaign=${campaign}&utm_content=clinica_e2e`,
  );
  await page.waitForTimeout(1500);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("kineflow.attribution.v1") ?? "null"));
  visitorId = await page.evaluate(() => localStorage.getItem("kineflow.visitor.v1"));
  check("ingreso con UTM guarda la atribución", stored?.utm_campaign === campaign && stored?.utm_content === "clinica_e2e");

  // 2. Navegación y visita posterior sin UTM (otra campaña tampoco la pisa).
  await page.goto(`${appUrl}/login`);
  await page.goto(`${appUrl}/?utm_source=google&utm_campaign=otra`);
  await page.goto(`${appUrl}/`);
  await page.waitForTimeout(800);
  const afterVisits = await page.evaluate(() => JSON.parse(localStorage.getItem("kineflow.attribution.v1") ?? "null"));
  check("visitas posteriores no reemplazan el first touch", afterVisits?.utm_campaign === campaign);

  // 3. Registro por el formulario real (se intercepta el signUp, ver arriba).
  let signupPayload = null;
  await page.route("**/auth/v1/signup**", async (route) => {
    signupPayload = route.request().postDataJSON();
    await route.fulfill({
      body: JSON.stringify({ session: null, user: null }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto(`${appUrl}/registro`);
  await page.getByPlaceholder("Dra. Sofia Ruiz").fill("E2E Atribución");
  await page.getByPlaceholder("MN 12345").fill(`E2E-${runId}`);
  await page.getByPlaceholder("+54 9 11 5555-5555").first().fill("+54 9 11 5555 0000");
  await page.getByPlaceholder("tu@email.com").fill(email);
  const passwords = page.getByPlaceholder("********");
  await passwords.nth(0).fill(`E2e-${runId}-pass`);
  await passwords.nth(1).fill(`E2e-${runId}-pass`);
  await page.locator('input[type="checkbox"]').first().check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.waitForTimeout(3000);
  check(
    "el formulario envía la atribución en el signUp",
    signupPayload?.data?.attribution?.utm_campaign === campaign &&
      signupPayload?.data?.attribution?.utm_content === "clinica_e2e" &&
      signupPayload?.data?.attribution?.visitor_id === visitorId,
    JSON.stringify(signupPayload?.data?.attribution),
  );
  check(
    "el formulario sigue mandando sus datos de siempre",
    signupPayload?.data?.account_type === "KINESIOLOGO" && Boolean(signupPayload?.data?.legal_version),
  );

  // 4. Usuario creado con ese mismo payload → atribución asociada.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `E2e-${runId}-pass`,
    user_metadata: signupPayload?.data ?? {},
  });
  userId = created?.user?.id ?? null;
  check("usuario creado", Boolean(userId), createError?.message ?? "");
  const { data: attribution } = await admin
    .from("user_attribution")
    .select("*")
    .eq("user_id", userId ?? "00000000-0000-0000-0000-000000000000")
    .maybeSingle();
  check(
    "atribución asociada al usuario (campaña y prospecto)",
    attribution?.utm_source === "email" &&
      attribution?.utm_campaign === campaign &&
      attribution?.utm_content === "clinica_e2e" &&
      attribution?.visitor_id === visitorId,
    JSON.stringify(attribution),
  );
  const { data: events } = await admin
    .from("acquisition_events")
    .select("event_type")
    .eq("visitor_id", visitorId ?? "00000000-0000-0000-0000-000000000000");
  const types = (events ?? []).map((event) => event.event_type).sort();
  check("eventos landing_view y signup_started registrados una vez", JSON.stringify(types) === JSON.stringify(["landing_view", "signup_started"]), JSON.stringify(types));

  // 5. Visitante sin UTM: el registro funciona igual y no manda atribución.
  const plainPage = await (await browser.newContext()).newPage();
  let plainPayload = null;
  await plainPage.route("**/auth/v1/signup**", async (route) => {
    plainPayload = route.request().postDataJSON();
    await route.fulfill({
      body: JSON.stringify({ session: null, user: null }),
      contentType: "application/json",
      status: 200,
    });
  });
  await plainPage.goto(`${appUrl}/registro`);
  await plainPage.getByPlaceholder("Dra. Sofia Ruiz").fill("E2E Sin UTM");
  await plainPage.getByPlaceholder("MN 12345").fill(`E2E-PLAIN-${runId}`);
  await plainPage.getByPlaceholder("+54 9 11 5555-5555").first().fill("+54 9 11 5555 0001");
  await plainPage.getByPlaceholder("tu@email.com").fill(`attr-plain-${runId}@example.com`);
  const plainPasswords = plainPage.getByPlaceholder("********");
  await plainPasswords.nth(0).fill(`E2e-${runId}-pass`);
  await plainPasswords.nth(1).fill(`E2e-${runId}-pass`);
  await plainPage.locator('input[type="checkbox"]').first().check();
  await plainPage.getByRole("button", { name: "Crear cuenta" }).click();
  await plainPage.getByText(/Cuenta creada/).waitFor({ timeout: 15000 });
  check(
    "sin UTM: el registro sigue igual y no envía atribución",
    Boolean(plainPayload?.data?.account_type) && plainPayload?.data?.attribution === undefined,
  );
} catch (error) {
  failures += 1;
  console.error("ERROR", error instanceof Error ? error.message : error);
} finally {
  await browser.close();

  if (visitorId) {
    await admin.from("acquisition_events").delete().eq("visitor_id", visitorId);
  }

  if (userId) {
    const { data: workspaces } = await admin.from("workspaces").select("id").eq("owner_id", userId);
    const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);

    if (workspaceIds.length) {
      await admin.from("workspace_members").delete().in("workspace_id", workspaceIds);
      await admin.from("workspaces").delete().in("id", workspaceIds);
    }

    await admin.auth.admin.deleteUser(userId);
  }
}

if (failures > 0) {
  console.error(`\n${failures} verificaciones fallaron.`);
  process.exit(1);
}

console.log("\nok - attribution-e2e: landing con UTM → registro → atribución asociada.");
