import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canCreatePatientByPolicy,
  isPlanVisibleForAccount,
  PLAN_LIMITS,
} from "../src/lib/billing-policy.ts";
import { formatMonto } from "../src/lib/format.ts";
import {
  areSignupsEnabled,
  SIGNUPS_CLOSED_MESSAGE,
} from "../src/lib/signups.ts";

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test("Plan Free permite crear pacientes hasta el limite configurado", () => {
  assert.equal(PLAN_LIMITS.FREE.maxPatients, 5);
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "KINESIOLOGO",
      activePatientCount: 4,
      patientLimit: 5,
      plan: "FREE",
      planStatus: "ACTIVO",
    }),
    true,
  );
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "KINESIOLOGO",
      activePatientCount: 5,
      patientLimit: 5,
      plan: "FREE",
      planStatus: "ACTIVO",
    }),
    false,
  );
});

test("KineFlow Particular habilita pacientes propios sin limite", () => {
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "KINESIOLOGO",
      activePatientCount: 100,
      patientLimit: null,
      plan: "INDEPENDIENTE",
      planStatus: "ACTIVO",
    }),
    true,
  );
});

test("Un usuario individual no ve planes de consultorio como flujo principal", () => {
  assert.equal(isPlanVisibleForAccount("FREE", "KINESIOLOGO"), true);
  assert.equal(isPlanVisibleForAccount("INDEPENDIENTE", "KINESIOLOGO"), true);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_2", "KINESIOLOGO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_5", "KINESIOLOGO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_10", "KINESIOLOGO"), false);
});

test("Con el feature flag apagado no se muestran planes de consultorio", () => {
  assert.equal(isPlanVisibleForAccount("FREE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("INDEPENDIENTE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_2", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_5", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO_10", "CONSULTORIO"), false);
});

test("Los montos se muestran con separador de miles argentino", () => {
  assert.equal(formatMonto(15000), "$ 15.000");
  assert.equal(formatMonto(20000), "$ 20.000");
});

test("Landing MVP1 habla solo a kinesiologos independientes", () => {
  const source = fs.readFileSync("src/app/page.tsx", "utf8");
  const button = fs.readFileSync("src/components/ui/Button.tsx", "utf8");

  assert.match(source, /kinesiologos independientes/);
  assert.match(source, /Gestiona tus pacientes, turnos y sesiones/);
  assert.match(source, /Crear cuenta gratis/);
  assert.match(source, /variant="inverted"/);
  assert.match(button, /inverted:/);
  assert.doesNotMatch(source, /consultorios/i);
  assert.doesNotMatch(source, /clinicas/i);
});

test("Planes comerciales muestran nombre, precio y copy actualizado", () => {
  const plans = fs.readFileSync("src/lib/plans.ts", "utf8");
  const planesPage = fs.readFileSync("src/app/dashboard/planes/page.tsx", "utf8");
  const migrations = [
    "supabase/migrations/202605270004_add_mercadopago_subscriptions.sql",
    "supabase/migrations/202605310001_init_kineflow_qa.sql",
  ].map((path) => fs.readFileSync(path, "utf8")).join("\n");

  assert.match(plans, /INDEPENDENT_PLAN_PRICE = 15000/);
  assert.match(plans, /name: "KineFlow - Particular"/);
  assert.match(plans, /price: `\$\{formatMonto\(INDEPENDENT_PLAN_PRICE\)\}\/mes`/);
  assert.match(plans, /Pacientes ilimitados/);
  assert.match(plans, /Pensado para usar desde el celular/);
  assert.match(plans, /Ideal para probar la herramienta/);
  assert.match(planesPage, /getPlanDisplayName/);
  assert.match(migrations, /KineFlow - Particular/);
  assert.match(migrations, /15000/);

  [plans, planesPage, migrations].forEach((source) => {
    const technicalCopy = `${"mobile"}-${"first"}`;

    assert.doesNotMatch(source, new RegExp(`Plan ${"Independiente"}`));
    assert.doesNotMatch(source, new RegExp(`149${"00"}|14\\.900`));
    assert.doesNotMatch(
      source,
      new RegExp(`Diseno ${technicalCopy}|Diseño ${technicalCopy}|${technicalCopy}`, "i"),
    );
  });
});

test("Registro nuevo fuerza cuenta de kinesiologo independiente", () => {
  const source = fs.readFileSync("src/app/registro/page.tsx", "utf8");

  assert.match(source, /account_type: "KINESIOLOGO"/);
  assert.doesNotMatch(source, /CONSULTORIO/);
  assert.match(source, /He leido y acepto/);
  assert.match(source, /termsOpen/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /termsSections\.map/);
});

test("Feature flag de registro queda abierto por defecto y cierra solo con false literal", () => {
  const originalValue = process.env.NEXT_PUBLIC_SIGNUPS_ENABLED;

  delete process.env.NEXT_PUBLIC_SIGNUPS_ENABLED;
  assert.equal(areSignupsEnabled(), true);

  process.env.NEXT_PUBLIC_SIGNUPS_ENABLED = "true";
  assert.equal(areSignupsEnabled(), true);

  process.env.NEXT_PUBLIC_SIGNUPS_ENABLED = "false";
  assert.equal(areSignupsEnabled(), false);

  if (originalValue === undefined) {
    delete process.env.NEXT_PUBLIC_SIGNUPS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_SIGNUPS_ENABLED = originalValue;
  }
});

test("Registro y login bloqueados no llaman a Supabase y muestran mensaje amigable", () => {
  const registerPage = fs.readFileSync("src/app/registro/page.tsx", "utf8");
  const loginPage = fs.readFileSync("src/app/login/page.tsx", "utf8");
  const navbar = fs.readFileSync("src/components/layout/PublicNavbar.tsx", "utf8");
  const home = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.equal(
    SIGNUPS_CLOSED_MESSAGE,
    "Por el momento el registro se encuentra cerrado. Si querés probar KineFlow, contactanos.",
  );
  assert.match(registerPage, /if \(!signupsEnabled\)[\s\S]*setError\(SIGNUPS_CLOSED_MESSAGE\)[\s\S]*return;/);
  assert.match(registerPage, /disabled=\{loading \|\| !signupsEnabled\}/);
  assert.match(registerPage, /supabase\.auth\.signUp/);
  assert.match(loginPage, /if \(!signupsEnabled\)[\s\S]*setError\(ACCESS_CLOSED_MESSAGE\)[\s\S]*return;/);
  assert.match(loginPage, /disabled=\{loading \|\| !signupsEnabled\}/);
  assert.match(loginPage, /supabase\.auth\.signInWithPassword/);
  assert.match(loginPage, /signupsEnabled \?/);
  assert.match(loginPage, /SIGNUPS_CLOSED_MESSAGE/);
  assert.match(navbar, /href="\/login"[\s\S]*Ingresar/);
  assert.match(navbar, /signupsEnabled \?/);
  assert.match(home, /\{signupsEnabled \? <a href="\/login">Ingresar<\/a> : null\}/);
  assert.match(home, /mailto:\$\{contactEmail\}\?subject=Quiero%20probar%20KineFlow/);
});

test("Retorno de Mercado Pago activa solo si preapproval pertenece al usuario", () => {
  const source = fs.readFileSync("src/app/api/billing/confirm-return/route.ts", "utf8");

  assert.match(source, /getMercadoPagoSubscription\(preapprovalId\)/);
  assert.match(source, /applyMercadoPagoSubscriptionToAccount/);
  assert.match(source, /parsed\?\.accountId === user\.id/);
  assert.match(source, /providerSubscription\.payer_email\?\.toLowerCase\(\)/);
  assert.match(source, /select\("plan, estado_plan/);
});

test("Checkout de Mercado Pago usa NEXT_PUBLIC_APP_URL y rutas QA reales", () => {
  const mercadoPago = fs.readFileSync("src/lib/mercadopago.ts", "utf8");
  const createSubscription = fs.readFileSync(
    "src/app/api/billing/create-subscription/route.ts",
    "utf8",
  );
  const envExample = fs.readFileSync(".env.example", "utf8");

  assert.match(mercadoPago, /process\.env\.NEXT_PUBLIC_APP_URL/);
  assert.doesNotMatch(mercadoPago, /NEXT_PUBLIC_SITE_URL/);
  assert.doesNotMatch(mercadoPago, /localhost:3000/);
  assert.match(mercadoPago, /success: `\$\{appUrl\}\/suscripcion-exitosa`/);
  assert.match(mercadoPago, /pending: `\$\{appUrl\}\/suscripcion-pendiente`/);
  assert.match(mercadoPago, /failure: `\$\{appUrl\}\/suscripcion-error`/);
  assert.match(createSubscription, /getMercadoPagoSubscriptionCheckoutUrl/);
  assert.match(createSubscription, /getMercadoPagoCheckoutInitPoint/);
  assert.doesNotMatch(createSubscription, /createMercadoPagoSubscriptionPreapproval/);
  assert.doesNotMatch(createSubscription, /card_token_id/);
  assert.match(envExample, /NEXT_PUBLIC_APP_URL=https:\/\/qa\.kineflow\.ar/);
  assert.doesNotMatch(envExample, /localhost|vercel\.app|https:\/\/kineflow\.ar/);
});

test("Post pago consulta Supabase antes de mostrar Plan activo", () => {
  const page = fs.readFileSync(
    "src/components/billing/SubscriptionReturnPage.tsx",
    "utf8",
  );
  const rootSuccess = fs.readFileSync("src/app/suscripcion-exitosa/page.tsx", "utf8");

  assert.match(page, /fetch\("\/api\/billing\/confirm-return"/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\(\s*"preapproval_id"/);
  assert.match(page, /JSON\.stringify\(\{ preapprovalId \}\)/);
  assert.match(page, /subscriptionStatus\?\.plan === "INDEPENDIENTE"/);
  assert.match(page, /subscriptionStatus\.status === "ACTIVO"/);
  assert.match(page, /Plan activo/);
  assert.match(page, /Estamos confirmando tu suscripción\. Esto puede demorar unos segundos\./);
  assert.match(rootSuccess, /SubscriptionReturnPage kind="success"/);
});

test("Webhook valida KineFlow Particular y mail posterior a activacion", () => {
  const webhook = fs.readFileSync("src/app/api/webhooks/mercadopago/route.ts", "utf8");
  const billingServer = fs.readFileSync("src/lib/billing-server.ts", "utf8");

  assert.match(webhook, /parsed\.planCode !== "INDEPENDIENTE"/);
  assert.match(webhook, /payment_events/);
  assert.match(billingServer, /internalStatus === "ACTIVE"/);
  assert.match(billingServer, /sendSubscriptionActivatedEmail/);
});

test("Webhook Mercado Pago acepta eventos de suscripcion y pago por ruta publica", () => {
  const webhook = fs.readFileSync("src/app/api/webhooks/mercadopago/route.ts", "utf8");
  const alias = fs.readFileSync("src/app/api/mercadopago/webhook/route.ts", "utf8");
  const mercadoPago = fs.readFileSync("src/lib/mercadopago.ts", "utf8");

  assert.match(alias, /api\/webhooks\/mercadopago\/route/);
  assert.match(webhook, /eventType\.includes\("preapproval"\)/);
  assert.match(webhook, /eventType\.includes\("authorized_payment"\)/);
  assert.match(webhook, /includes\("payment"\)/);
  assert.match(webhook, /getProviderSubscriptionFromEvent/);
  assert.match(webhook, /getMercadoPagoAuthorizedPayment/);
  assert.match(webhook, /findMercadoPagoAuthorizedPaymentByPaymentId/);
  assert.match(webhook, /getMercadoPagoPayment/);
  assert.match(webhook, /MERCADOPAGO_WEBHOOK_SECRET/);
  assert.match(webhook, /processingError: true/);
  assert.match(mercadoPago, /MERCADOPAGO_ACCESS_TOKEN/);
  assert.match(mercadoPago, /authorized_payments\/search/);
  assert.match(mercadoPago, /\/v1\/payments\/\$\{paymentId\}/);
});

test("Retorno accidental a home con preapproval_id redirige a post pago", () => {
  const home = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.match(home, /searchParams\?: Promise/);
  assert.match(home, /params\?\.preapproval_id/);
  assert.match(home, /redirect\(`\/suscripcion-exitosa\?preapproval_id=\$\{preapprovalId\}`\)/);
});

test("Preflight OPTIONS responde antes de llegar a paginas Next", () => {
  const middleware = fs.readFileSync("src/middleware.ts", "utf8");

  assert.match(middleware, /request\.method !== "OPTIONS"/);
  assert.match(middleware, /status: 204/);
  assert.match(middleware, /Access-Control-Allow-Methods/);
  assert.match(middleware, /https:\/\/qa\.kineflow\.ar/);
  assert.match(middleware, /mercadopago\.com\.ar/);
});

test("Baja de suscripcion llama a Mercado Pago, usa la ruta publica y registra referencia", () => {
  const source = fs.readFileSync("src/app/api/billing/cancel-subscription/route.ts", "utf8");
  const alias = fs.readFileSync("src/app/api/subscriptions/cancel/route.ts", "utf8");
  const page = fs.readFileSync("src/app/dashboard/planes/page.tsx", "utf8");

  assert.match(source, /cancelMercadoPagoSubscription/);
  assert.match(source, /mercado_pago_preapproval_id/);
  assert.match(source, /No encontramos una suscripcion activa para cancelar/);
  assert.match(source, /No pudimos cancelar la suscripcion en este momento/);
  assert.match(source, /cancellationReference/);
  assert.match(source, /plan_status: "cancelled"/);
  assert.match(source, /mercado_pago_status/);
  assert.match(source, /sendSubscriptionCancelledEmail/);
  assert.match(alias, /cancel-subscription/);
  assert.match(page, /canCancelSubscription/);
  assert.match(page, /plan\.plan === "INDEPENDIENTE"/);
  assert.match(page, /plan\.estadoPlan === "ACTIVO"/);
  assert.match(page, /\/api\/subscriptions\/cancel/);
});

test("Webhook sincroniza altas, pausas y cancelaciones desde Mercado Pago", () => {
  const webhook = fs.readFileSync("src/app/api/webhooks/mercadopago/route.ts", "utf8");
  const billingServer = fs.readFileSync("src/lib/billing-server.ts", "utf8");
  const mercadoPago = fs.readFileSync("src/lib/mercadopago.ts", "utf8");

  assert.match(webhook, /getMercadoPagoSubscription\(params\.resourceId\)/);
  assert.match(webhook, /mercado_pago_preapproval_id/);
  assert.match(webhook, /status_recibido/);
  assert.match(webhook, /preapproval_id/);
  assert.match(mercadoPago, /status === "authorized"/);
  assert.match(mercadoPago, /status === "paused"/);
  assert.match(mercadoPago, /status === "canceled" \|\| status === "cancelled"/);
  assert.match(billingServer, /effectivePlanCode = internalStatus === "ACTIVE" \? planCode : "FREE"/);
  assert.match(billingServer, /plan_status:[\s\S]*"cancelled"[\s\S]*internalStatus\.toLowerCase/);
  assert.match(billingServer, /cancelled_at/);
});

test("Links legales existen", () => {
  [
    "src/app/terminos-y-condiciones/page.tsx",
    "src/app/politica-de-privacidad/page.tsx",
    "src/app/politica-de-suscripcion-y-baja/page.tsx",
    "src/app/baja-de-servicio/page.tsx",
    "src/app/arrepentimiento/page.tsx",
    "src/app/contacto-soporte/page.tsx",
  ].forEach((path) => assert.equal(fs.existsSync(path), true, path));
});

test("Logout del dashboard tiene timeout, limpieza local y fallback de redireccion", () => {
  const source = fs.readFileSync("src/components/layout/DashboardSidebar.tsx", "utf8");

  assert.match(source, /LOGOUT_TIMEOUT_MS/);
  assert.match(source, /withTimeout\(\s*supabase\.auth\.signOut\(\)/);
  assert.match(source, /resetAuthSnapshot/);
  assert.match(source, /resetSubscriptionPlanSnapshot/);
  assert.match(source, /clearSupabaseLocalSession/);
  assert.match(source, /window\.location\.replace\("\/login"\)/);
  assert.match(source, /LOGOUT_REDIRECT_FALLBACK_MS/);
  assert.match(source, /setLoggingOut\(false\)/);
});
