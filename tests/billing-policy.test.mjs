import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canCreatePatientByPolicy,
  isPlanVisibleForAccount,
  PLAN_LIMITS,
} from "../src/lib/billing-policy.ts";
import { formatMonto } from "../src/lib/format.ts";
import {
  arePublicAuthLinksVisible,
  areSignupsEnabled,
  isLoginEnabled,
  SIGNUPS_CLOSED_MESSAGE,
} from "../src/lib/signups.ts";
import {
  assertClinicProfessionalStatus,
  decideClinicProfessionalMembership,
} from "../src/lib/clinic-professional-membership.ts";
import {
  decideAuthEvent,
  getAuthRouteKind,
} from "../src/lib/auth-event-policy.ts";

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
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "CONSULTORIO",
      activePatientCount: 4,
      patientLimit: 5,
      plan: "FREE",
      planStatus: "ACTIVO",
    }),
    true,
  );
  assert.equal(
    canCreatePatientByPolicy({
      accountType: "CONSULTORIO",
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
  assert.equal(isPlanVisibleForAccount("CONSULTORIO", "KINESIOLOGO"), false);
});

test("Una cuenta consultorio ve solo el plan de consultorio", () => {
  assert.equal(isPlanVisibleForAccount("FREE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("INDEPENDIENTE", "CONSULTORIO"), false);
  assert.equal(isPlanVisibleForAccount("CONSULTORIO", "CONSULTORIO"), true);
});

test("Los montos se muestran con separador de miles argentino", () => {
  assert.equal(formatMonto(15000), "$ 15.000");
  assert.equal(formatMonto(20000), "$ 20.000");
});

test("Landing MVP1 habla solo a kinesiólogos independientes", () => {
  const source = fs.readFileSync("src/app/page.tsx", "utf8");
  const button = fs.readFileSync("src/components/ui/Button.tsx", "utf8");

  assert.match(source, /kinesiólogos independientes/);
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

test("Registro nuevo permite elegir workspace inicial sin duplicar usuarios", () => {
  const source = fs.readFileSync("src/app/registro/page.tsx", "utf8");
  const migration = fs.readFileSync(
    "supabase/migrations/202606300004_initial_workspace_registration.sql",
    "utf8",
  );

  assert.match(source, /initialWorkspaceType/);
  assert.match(source, /Kinesiologo independiente/);
  assert.match(source, /Consultorio \/ Clinica/);
  assert.match(source, /account_type: isClinicWorkspace \? "CONSULTORIO" : "KINESIOLOGO"/);
  assert.match(source, /initial_workspace_type: initialWorkspaceType/);
  assert.match(source, /organization_name: isClinicWorkspace \? organizationName : null/);
  assert.doesNotMatch(source, /Persona responsable/);
  assert.match(source, /responsible_name: null/);
  assert.match(source, /He leído y acepto/);
  assert.match(source, /LEGAL_VERSION/);
  assert.match(source, /legal_version: LEGAL_VERSION/);
  assert.match(source, /href="\/terminos-y-condiciones"/);
  assert.match(migration, /coalesce\(new\.account_type, 'KINESIOLOGO'\) <> 'KINESIOLOGO'/);
  assert.match(migration, /insert into public\.workspaces/);
  assert.match(migration, /'PERSONAL'/);
});

test("Acceso directo queda abierto por defecto y cierra solo con flags explicitos", () => {
  const originalSignupValue = process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED;
  const originalLoginValue = process.env.NEXT_PUBLIC_LOGIN_ENABLED;

  delete process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED;
  delete process.env.NEXT_PUBLIC_LOGIN_ENABLED;
  assert.equal(areSignupsEnabled(), true);
  assert.equal(isLoginEnabled(), true);

  process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED = "true";
  process.env.NEXT_PUBLIC_LOGIN_ENABLED = "true";
  assert.equal(areSignupsEnabled(), true);
  assert.equal(isLoginEnabled(), true);

  process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED = "false";
  process.env.NEXT_PUBLIC_LOGIN_ENABLED = "false";
  assert.equal(areSignupsEnabled(), false);
  assert.equal(isLoginEnabled(), false);

  if (originalSignupValue === undefined) {
    delete process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_ACCOUNT_CREATION_ENABLED = originalSignupValue;
  }

  if (originalLoginValue === undefined) {
    delete process.env.NEXT_PUBLIC_LOGIN_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_LOGIN_ENABLED = originalLoginValue;
  }
});

test("Links publicos de registro e ingreso se pueden ocultar sin bloquear acceso directo", () => {
  const originalSignupValue = process.env.NEXT_PUBLIC_SIGNUPS_ENABLED;
  const originalLinksValue = process.env.NEXT_PUBLIC_PUBLIC_AUTH_LINKS_VISIBLE;

  delete process.env.NEXT_PUBLIC_SIGNUPS_ENABLED;
  delete process.env.NEXT_PUBLIC_PUBLIC_AUTH_LINKS_VISIBLE;
  assert.equal(arePublicAuthLinksVisible(), true);

  process.env.NEXT_PUBLIC_SIGNUPS_ENABLED = "false";
  assert.equal(arePublicAuthLinksVisible(), false);
  assert.equal(areSignupsEnabled(), true);
  assert.equal(isLoginEnabled(), true);

  process.env.NEXT_PUBLIC_SIGNUPS_ENABLED = "true";
  process.env.NEXT_PUBLIC_PUBLIC_AUTH_LINKS_VISIBLE = "false";
  assert.equal(arePublicAuthLinksVisible(), false);

  if (originalSignupValue === undefined) {
    delete process.env.NEXT_PUBLIC_SIGNUPS_ENABLED;
  } else {
    process.env.NEXT_PUBLIC_SIGNUPS_ENABLED = originalSignupValue;
  }

  if (originalLinksValue === undefined) {
    delete process.env.NEXT_PUBLIC_PUBLIC_AUTH_LINKS_VISIBLE;
  } else {
    process.env.NEXT_PUBLIC_PUBLIC_AUTH_LINKS_VISIBLE = originalLinksValue;
  }
});

test("Registro y login usan bloqueos explicitos y ocultan links publicos", () => {
  const registerPage = fs.readFileSync("src/app/registro/page.tsx", "utf8");
  const loginPage = fs.readFileSync("src/app/login/page.tsx", "utf8");
  const navbar = fs.readFileSync("src/components/layout/PublicNavbar.tsx", "utf8");
  const home = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.equal(
    SIGNUPS_CLOSED_MESSAGE,
    "🚀 KineFlow se encuentra actualmente en etapa de acceso limitado.\n\nSi sos kinesiólogo y querés conocer la plataforma o participar de las pruebas iniciales, contactanos.",
  );
  assert.match(registerPage, /ACCESS_REQUEST_MAILTO/);
  assert.match(registerPage, /Solicitar acceso/);
  assert.match(registerPage, /if \(!signupsEnabled\)[\s\S]*setError\(SIGNUPS_CLOSED_MESSAGE\)[\s\S]*return;/);
  assert.match(registerPage, /disabled=\{loading \|\| !signupsEnabled \|\| !acceptedLegal\}/);
  assert.match(registerPage, /supabase\.auth\.signUp/);
  assert.match(loginPage, /if \(!loginEnabled\)[\s\S]*setError\(ACCESS_CLOSED_MESSAGE\)[\s\S]*return;/);
  assert.match(loginPage, /disabled=\{loading \|\| !loginEnabled\}/);
  assert.match(loginPage, /supabase\.auth\.signInWithPassword/);
  assert.match(loginPage, /showAuthLinks \?/);
  assert.match(navbar, /href="\/login"[\s\S]*Ingresar/);
  assert.match(navbar, /showAuthLinks \?/);
  assert.match(home, /ACCESS_REQUEST_MAILTO/);
  assert.match(home, /Solicitar acceso/);
  assert.match(home, /© 2026 KineFlow\. Todos los derechos reservados\./);
  assert.match(home, /https:\/\/www\.instagram\.com\/kineflow\.ar\//);
  assert.match(home, /rel="noopener noreferrer"/);
  assert.match(home, /mailto:\$\{contactEmail\}\?subject=Quiero%20probar%20KineFlow/);
});

test("Retorno de Mercado Pago activa solo si preapproval pertenece al usuario", () => {
  const source = fs.readFileSync("src/app/api/billing/confirm-return/route.ts", "utf8");

  assert.match(source, /getMercadoPagoSubscription\(preapprovalId\)/);
  assert.match(source, /applyMercadoPagoSubscriptionToAccount/);
  assert.match(source, /parsed\?\.accountId === user\.id/);
  assert.match(source, /parts\.length >= 4/);
  assert.match(source, /workspaceId: parsed\?\.workspaceId \?\? undefined/);
  assert.match(source, /MERCADOPAGO_PLAN_EXTERNAL_REFERENCES/);
  assert.match(source, /"KINEPART"/);
  assert.match(source, /"KINEINDEP"/);
  assert.match(source, /!payerEmail/);
  assert.match(source, /payerEmail === userEmail/);
  assert.match(source, /from\("subscriptions"\)/);
  assert.match(source, /plans\(code\)/);
  assert.doesNotMatch(source, /select\("plan, estado_plan/);
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
  assert.match(createSubscription, /workspaceId\?: string \| null/);
  assert.match(createSubscription, /planId !== "INDEPENDIENTE" && planId !== "CONSULTORIO"/);
  assert.match(createSubscription, /planId === "CONSULTORIO" && !workspaceId/);
  assert.match(createSubscription, /planId === "CONSULTORIO" \? "CLINICA" : "PERSONAL"/);
  assert.match(createSubscription, /workspace\.type !== expectedWorkspaceType/);
  assert.match(createSubscription, /workspace\.owner_id !== user\.id/);
  assert.match(createSubscription, /\$\{workspaceId \?\? "account"\}/);
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
  assert.match(page, /fetch\("\/api\/billing\/current"/);
  assert.match(page, /new URLSearchParams\(window\.location\.search\)\.get\(\s*"preapproval_id"/);
  assert.match(page, /JSON\.stringify\(\{ preapprovalId \}\)/);
  assert.match(page, /confirmedPreapprovalRef/);
  assert.match(page, /POLLING_INTERVAL_MS = 3000/);
  assert.match(page, /MAX_POLLING_ATTEMPTS = 5/);
  assert.match(page, /waitForActiveSubscription/);
  assert.match(page, /normalizeSubscriptionStatus/);
  assert.match(page, /subscriptionProviderStatus === "ACTIVE"/);
  assert.match(page, /subscriptionStatus\?\.plan === "INDEPENDIENTE"/);
  assert.match(page, /subscriptionStatus\?\.plan === "CONSULTORIO"/);
  assert.match(page, /subscriptionStatus\.status === "ACTIVO"/);
  assert.match(page, /kind === "success" && !isActive[\s\S]*"KineFlow - Particular"/);
  assert.match(page, /Suscripción recibida/);
  assert.match(page, /Plan activo/);
  assert.match(page, /Tu plan est(?:a|á) activo/);
  assert.match(page, /confirmando el pago con Mercado Pago/);
  assert.match(rootSuccess, /SubscriptionReturnPage kind="success"/);
});

test("Webhook aplica planes pagos y mail posterior a activacion", () => {
  const webhook = fs.readFileSync("src/app/api/webhooks/mercadopago/route.ts", "utf8");
  const billingServer = fs.readFileSync("src/lib/billing-server.ts", "utf8");

  assert.doesNotMatch(webhook, /parsed\.planCode !== "INDEPENDIENTE"/);
  assert.match(webhook, /parsed\.planCode === "CONSULTORIO" \? "CONSULTORIO" : "KINESIOLOGO"/);
  assert.match(webhook, /parts\.length >= 4/);
  assert.match(webhook, /workspaceId: parsed\.workspaceId \?\? undefined/);
  assert.match(webhook, /payment_events/);
  assert.match(billingServer, /internalStatus === "ACTIVE"/);
  assert.match(billingServer, /workspace_id: workspaceId \?\? null/);
  assert.match(billingServer, /sendSubscriptionActivatedEmail/);
});

test("Actualizacion de plan loguea errores exactos de Supabase", () => {
  const billingServer = fs.readFileSync("src/lib/billing-server.ts", "utf8");

  assert.match(billingServer, /type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>/);
  assert.match(billingServer, /code: error\.code/);
  assert.match(billingServer, /details: error\.details/);
  assert.match(billingServer, /hint: error\.hint/);
  assert.match(billingServer, /message: error\.message/);
  assert.match(billingServer, /Supabase subscription upsert failed/);
  assert.match(billingServer, /subscriptionUpsertError\.message/);
  assert.doesNotMatch(billingServer, /estado_plan|limite_pacientes|mercado_pago_status|plan_status|subscription_current_period_end/);
});

test("Webhook Mercado Pago acepta eventos de suscripción y pago por ruta publica", () => {
  const webhook = fs.readFileSync("src/app/api/webhooks/mercadopago/route.ts", "utf8");
  const alias = fs.readFileSync("src/app/api/mercadopago/webhook/route.ts", "utf8");
  const testEndpoint = fs.readFileSync(
    "src/app/api/mercadopago/webhook-test/route.ts",
    "utf8",
  );
  const mercadoPago = fs.readFileSync("src/lib/mercadopago.ts", "utf8");
  const envExample = fs.readFileSync(".env.example", "utf8");

  assert.match(alias, /api\/webhooks\/mercadopago\/route/);
  assert.match(webhook, /eventType\.includes\("preapproval"\)/);
  assert.match(webhook, /eventType\.includes\("authorized_payment"\)/);
  assert.match(webhook, /includes\("payment"\)/);
  assert.match(webhook, /getProviderSubscriptionFromEvent/);
  assert.match(webhook, /getMercadoPagoAuthorizedPayment/);
  assert.match(webhook, /findMercadoPagoAuthorizedPaymentByPaymentId/);
  assert.match(webhook, /getMercadoPagoPayment/);
  assert.match(webhook, /MERCADOPAGO_WEBHOOK_SECRET/);
  assert.match(webhook, /isMercadoPagoDashboardTestEvent/);
  assert.match(webhook, /isMercadoPagoDashboardTestRequest/);
  assert.match(webhook, /Request received/);
  assert.match(webhook, /Unauthorized request rejected/);
  assert.match(webhook, /missing_signature_headers_or_data_id/);
  assert.match(webhook, /x-vercel-protection-bypass/);
  assert.match(webhook, /SKIP_WEBHOOK_SIGNATURE_VERIFICATION/);
  assert.match(webhook, /process\.env\.NODE_ENV !== "production"/);
  assert.match(webhook, /payloadDataId \?\? url\.searchParams\.get\("data\.id"\) \?\? url\.searchParams\.get\("id"\)/);
  assert.match(webhook, /Payment loaded/);
  assert.match(webhook, /Authorized payment lookup complete/);
  assert.match(webhook, /payload\.id\?\.toString\(\) === "123456"/);
  assert.match(webhook, /payload\.type\?\.toString\(\) === "subscription_preapproval"/);
  assert.match(webhook, /processingError: true/);
  assert.match(webhook, /processMercadoPagoSubscriptionForWebhook/);
  assert.match(testEndpoint, /NODE_ENV === "production"/);
  assert.match(testEndpoint, /getMercadoPagoSubscription\(preapprovalId\)/);
  assert.match(testEndpoint, /providerSubscription\.status !== "authorized"/);
  assert.match(testEndpoint, /processMercadoPagoSubscriptionForWebhook/);
  assert.match(envExample, /SKIP_WEBHOOK_SIGNATURE_VERIFICATION=false/);
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

test("Baja de suscripción llama a Mercado Pago, usa la ruta publica y registra referencia", () => {
  const source = fs.readFileSync("src/app/api/billing/cancel-subscription/route.ts", "utf8");
  const alias = fs.readFileSync("src/app/api/subscriptions/cancel/route.ts", "utf8");
  const page = fs.readFileSync("src/app/dashboard/planes/page.tsx", "utf8");

  assert.match(source, /cancelMercadoPagoSubscription/);
  assert.match(source, /provider_subscription_id/);
  assert.match(source, /No encontramos una suscripción activa para cancelar/);
  assert.match(source, /No pudimos cancelar la suscripción en este momento/);
  assert.match(source, /cancellationReference/);
  assert.match(source, /status: "CANCELLED"/);
  assert.doesNotMatch(source, /estado_plan|mercado_pago_status|plan_status|subscription_canceled_at/);
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
  assert.match(webhook, /status_recibido/);
  assert.match(webhook, /preapproval_id/);
  assert.match(mercadoPago, /status === "authorized"/);
  assert.match(mercadoPago, /status === "paused"/);
  assert.match(mercadoPago, /status === "canceled" \|\| status === "cancelled"/);
  assert.match(billingServer, /effectivePlanCode = internalStatus === "ACTIVE" \? planCode : "FREE"/);
  assert.match(billingServer, /\.eq\("workspace_id", workspaceId \?\? null\)/);
  assert.match(billingServer, /upsert\(subscriptionPayload, \{ onConflict: "account_id,workspace_id" \}\)/);
  assert.match(billingServer, /status: storedStatus/);
  assert.doesNotMatch(billingServer, /estado_plan|limite_pacientes|mercado_pago_status|plan_status|subscription_current_period_end/);
});

test("Limite de pacientes se calcula desde subscriptions y plans", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202606050001_move_patient_limits_to_subscriptions.sql",
    "utf8",
  );
  const clinicFreeMigration = fs.readFileSync(
    "supabase/migrations/202607010001_extend_free_plan_to_clinic_workspaces.sql",
    "utf8",
  );
  const seed = fs.readFileSync("supabase/seed.qa.sql", "utf8");

  assert.match(migration, /join public\.plans on plans\.id = subscriptions\.plan_id/);
  assert.match(migration, /plans\.max_patients/);
  assert.match(migration, /subscriptions\.account_id = new\.owner_id/);
  assert.match(migration, /subscriptions\.status = 'ACTIVE'/);
  assert.doesNotMatch(migration, /profiles\.plan|profiles\.estado_plan|profiles\.limite_pacientes|profiles\.cantidad_kinesiologos/);
  assert.match(seed, /insert into public\.subscriptions/);
  assert.doesNotMatch(seed, /plan,\s*estado_plan|fecha_inicio_plan|limite_pacientes|cantidad_kinesiologos/);
  assert.match(clinicFreeMigration, /create or replace function public\.get_workspace_patient_limit/);
  assert.match(clinicFreeMigration, /where plans\.code = 'FREE'/);
  assert.doesNotMatch(clinicFreeMigration, /current_account_type = 'CONSULTORIO'/);
});

test("Migracion workspace crea base multi-clinica sin duplicar datos clinicos", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202606300001_add_workspaces_foundation.sql",
    "utf8",
  );
  const multiProfessionalMigration = fs.readFileSync(
    "supabase/migrations/202607020001_multi_professional_clinic_patients.sql",
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.workspaces/);
  assert.match(migration, /type in \('PERSONAL', 'CLINICA'\)/);
  assert.match(migration, /create table if not exists public\.workspace_members/);
  assert.match(migration, /role in \('ADMIN', 'KINESIOLOGO'\)/);
  assert.match(migration, /create table if not exists public\.patient_assignments/);
  assert.match(migration, /add column if not exists workspace_id uuid references public\.workspaces/);
  assert.match(migration, /set workspace_id = patients\.workspace_id/);
  assert.match(migration, /public\.is_workspace_admin/);
  assert.match(migration, /public\.can_access_workspace_patient/);
  assert.match(migration, /public\.get_workspace_patient_limit/);
  assert.match(migration, /public\.ensure_profile_personal_workspace/);
  assert.match(migration, /public\.ensure_clinic_workspace/);
  assert.match(migration, /public\.sync_clinic_professional_workspace_member/);
  assert.match(migration, /public\.set_record_workspace_id/);
  assert.match(migration, /public\.validate_patient_assignment_workspace/);
  assert.match(migration, /on public\.workspaces for select/);
  assert.match(migration, /on public\.workspace_members for select/);
  assert.match(migration, /on public\.patient_assignments for all/);
  assert.match(multiProfessionalMigration, /add column if not exists assigned_professional_id/);
  assert.match(multiProfessionalMigration, /patients_assigned_professional_id_idx/);
  assert.match(multiProfessionalMigration, /can_view_assigned_patients/);
  assert.match(multiProfessionalMigration, /assigned_professional_id = auth\.uid\(\)/);
  assert.match(multiProfessionalMigration, /patients\.clinic_id is null/);
});

test("RLS workspace reemplaza permisos sensibles basados solo en owner_id", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202606300002_harden_workspace_rls.sql",
    "utf8",
  );

  assert.match(migration, /can_access_workspace_appointment/);
  assert.match(migration, /can_manage_workspace_appointment/);
  assert.match(migration, /can_access_workspace_treatment/);
  assert.match(migration, /can_insert_workspace_patient/);
  assert.match(migration, /can_insert_workspace_appointment/);
  assert.match(migration, /can_insert_workspace_evolution/);
  assert.match(migration, /get_workspace_patient_limit_block_message/);
  assert.match(migration, /drop policy if exists "Users can read own patients"/);
  assert.match(migration, /using \(public\.can_access_workspace_patient\(id\)\)/);
  assert.match(migration, /on public\.appointments for select/);
  assert.match(migration, /using \(public\.can_access_workspace_appointment\(id\)\)/);
  assert.match(migration, /on public\.treatments for select/);
  assert.match(migration, /workspace_id is not null[\s\S]*public\.is_workspace_admin\(workspace_id\)/);
  assert.doesNotMatch(migration, /on public\.patients for select[\s\S]{0,120}auth\.uid\(\) = owner_id/);
});

test("Invitaciones workspace permiten email sin duplicar usuarios", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202606300003_allow_email_workspace_invitations.sql",
    "utf8",
  );
  const clinicAdminHook = fs.readFileSync("src/hooks/useClinicAdmin.ts", "utf8");
  const clinicLinksHook = fs.readFileSync("src/hooks/useClinicLinks.ts", "utf8");
  const clinicsPage = fs.readFileSync(
    "src/app/dashboard/consultorios/page.tsx",
    "utf8",
  );

  assert.match(migration, /professional_id is null/);
  assert.match(migration, /professional_email = public\.current_user_email\(\)/);
  assert.match(migration, /public\.is_workspace_admin\(public\.get_clinic_workspace_id\(clinic_id\)\)/);
  assert.match(migration, /Clinics can search kinesiologists/);
  assert.match(clinicAdminHook, /professional_id: input\.professional\.id/);
  assert.match(clinicLinksHook, /professional_id\.is\.null/);
  assert.match(clinicLinksHook, /professional_email\.eq/);
  assert.match(clinicsPage, /Invitar por email/);
  assert.match(clinicsPage, /inviteEmail/);
});

test("Equipo de clinica permite invitar profesionales por email", () => {
  const sidebar = fs.readFileSync("src/components/layout/DashboardSidebar.tsx", "utf8");
  const teamPage = fs.readFileSync("src/app/dashboard/kinesiologos/page.tsx", "utf8");
  const teamHook = fs.readFileSync("src/hooks/useClinicKinesiologists.ts", "utf8");
  const invitationPage = fs.readFileSync("src/app/invitacion/page.tsx", "utf8");
  const registerPage = fs.readFileSync("src/app/registro/page.tsx", "utf8");
  const inviteRoute = fs.readFileSync("src/app/api/invite-professional/route.ts", "utf8");
  const migration = [
    "supabase/migrations/202605270002_add_clinic_professional_model.sql",
    "supabase/migrations/202607020002_clinic_invitation_token_flow.sql",
  ].map((path) => fs.readFileSync(path, "utf8")).join("\n");

  assert.match(sidebar, /UsersRound/);
  assert.match(sidebar, /\/dashboard\/equipo/);
  assert.match(sidebar, /activeWorkspace\?\.type === "CLINICA" && activeWorkspace\.role === "ADMIN"/);
  assert.match(teamHook, /clinic_professionals/);
  assert.match(teamHook, /CLINIC_PROFESSIONAL_STATUS\.pending/);
  assert.match(teamHook, /CLINIC_PROFESSIONAL_STATUS\.accepted/);
  assert.match(teamPage, /Agregar kinesiólogo/);
  assert.match(teamPage, /\/api\/invite-professional/);
  assert.match(teamPage, /lookup\.exists/);
  assert.match(inviteRoute, /https:\/\/api\.resend\.com\/emails/);
  assert.match(inviteRoute, /\/invitacion\?token=\$\{token\}/);
  assert.match(invitationPage, /get_clinic_professional_invitation/);
  assert.match(invitationPage, /answer_clinic_professional_invitation/);
  assert.match(invitationPage, /router\.replace\(`\/registro\?token=/);
  assert.match(registerPage, /answer_clinic_professional_invitation/);
  assert.match(registerPage, /target_status: CLINIC_PROFESSIONAL_STATUS\.accepted/);
  assert.match(migration, /status in \('pending', 'accepted', 'rejected', 'inactive'\)/);
  assert.match(migration, /target_status not in \('accepted', 'rejected'\)/);
});

test("Inicio muestra y responde invitaciones pendientes a clinicas", () => {
  const dashboardPage = fs.readFileSync("src/app/dashboard/page.tsx", "utf8");
  const hook = fs.readFileSync(
    "src/hooks/usePendingClinicInvitations.ts",
    "utf8",
  );
  const banner = fs.readFileSync(
    "src/components/dashboard/PendingClinicInvitationsBanner.tsx",
    "utf8",
  );

  assert.match(dashboardPage, /usePendingClinicInvitations\(user\)/);
  assert.match(dashboardPage, /<PendingClinicInvitationsBanner/);
  assert.match(dashboardPage, /await refreshWorkspaces\(\)/);
  assert.match(hook, /\.from\("clinic_professionals"\)/);
  assert.match(hook, /\.eq\("status", "pending"\)/);
  assert.match(hook, /professional_id\.eq\.\$\{user\.id\}/);
  assert.match(hook, /professional_email\.eq\.\$\{userEmail\}/);
  assert.match(hook, /clinics\(name\)/);
  assert.match(hook, /answer_clinic_professional_invitation/);
  assert.match(hook, /answerInvitation\(id, "active"\)/);
  assert.match(hook, /answerInvitation\(id, "inactive"\)/);
  assert.match(hook, /target_professional_id: user\.id/);
  assert.match(banner, /La clínica \{invitation\.clinicName\} te invitó a unirte al equipo/);
  assert.match(banner, /Aceptar/);
  assert.match(banner, /Rechazar/);
});

test("Navegacion principal muestra agenda y pacientes en desktop y mobile", () => {
  const sidebar = fs.readFileSync("src/components/layout/DashboardSidebar.tsx", "utf8");

  assert.match(sidebar, /\{ href: "\/dashboard\/pacientes", label: "Pacientes", icon: Users \}/);
  assert.match(sidebar, /\{ href: "\/dashboard\/turnos", label: "Agenda", icon: CalendarDays \}/);
  assert.doesNotMatch(sidebar, /label: "Turnos"/);
  assert.match(sidebar, /const mobileNavigationOrder = \[\s*"\/dashboard",\s*"\/dashboard\/turnos",\s*"\/dashboard\/pacientes",\s*"\/dashboard\/planes",\s*\]/);
  assert.match(sidebar, /grid-cols-4/);
  assert.match(sidebar, /item\.href !== "\/dashboard\/ingresos"/);
  assert.doesNotMatch(sidebar, /\["\/dashboard\/pacientes", "\/dashboard\/ingresos"\]/);
});

test("Recuperacion de contraseña usa Supabase Auth y campo reutilizable", () => {
  const loginPage = fs.readFileSync("src/app/login/page.tsx", "utf8");
  const recoverPage = fs.readFileSync("src/app/recuperar-password/page.tsx", "utf8");
  const newPasswordPage = fs.readFileSync("src/app/nueva-password/page.tsx", "utf8");
  const passwordInput = fs.readFileSync("src/components/ui/PasswordInput.tsx", "utf8");
  const authHelpers = fs.readFileSync("src/lib/auth.ts", "utf8");
  const docs = fs.readFileSync("docs/ENVIRONMENTS.md", "utf8");
  const registerPage = fs.readFileSync("src/app/registro/page.tsx", "utf8");

  assert.match(loginPage, /href="\/recuperar-password"/);
  assert.match(loginPage, /¿Olvidaste tu contraseña\?/);
  assert.match(recoverPage, /resetPasswordForEmail/);
  assert.match(recoverPage, /redirectTo: getBrowserAuthRedirectUrl\("\/nueva-password"\)/);
  assert.match(authHelpers, /PASSWORD_RECOVERY_CONFIRMATION/);
  assert.match(authHelpers, /window\.location\.origin/);
  assert.doesNotMatch(authHelpers + recoverPage + newPasswordPage, /localhost/);
  assert.match(newPasswordPage, /exchangeCodeForSession/);
  assert.match(newPasswordPage, /setSession/);
  assert.match(newPasswordPage, /updateUser\(\{\s*password,\s*\}\)/);
  assert.match(newPasswordPage, /Las contraseñas no coinciden/);
  assert.match(newPasswordPage, /El enlace de recuperación es inválido o venció/);
  assert.match(passwordInput, /type=\{visible \? "text" : "password"\}/);
  assert.match(passwordInput, /aria-label=\{visible \? "Ocultar contraseña" : "Mostrar contraseña"\}/);
  assert.match(passwordInput, /type="button"/);
  assert.match(registerPage, /<PasswordInput/);
  assert.match(docs, /\/nueva-password/);
  assert.match(docs, /Redirect URLs permitidas/);
});

test("Equipo agrega un kinesiologo existente como aceptado", () => {
  const decision = decideClinicProfessionalMembership({
    activeLink: null,
    clinicId: "clinic-a",
    inactiveLink: null,
    lookup: {
      email: "KINE@EMAIL.COM",
      exists: true,
      id: "professional-a",
    },
  });

  assert.equal(decision.type, "insert");
  assert.equal(decision.payload.clinic_id, "clinic-a");
  assert.equal(decision.payload.professional_email, "kine@email.com");
  assert.equal(decision.payload.professional_id, "professional-a");
  assert.equal(decision.payload.status, "accepted");
});

test("Equipo invita un kinesiologo no registrado como pendiente", () => {
  const decision = decideClinicProfessionalMembership({
    activeLink: null,
    clinicId: "clinic-a",
    inactiveLink: null,
    lookup: {
      email: "nuevo@email.com",
      exists: false,
      id: null,
    },
  });

  assert.equal(decision.type, "insert");
  assert.equal(decision.payload.professional_email, "nuevo@email.com");
  assert.equal(decision.payload.professional_id, null);
  assert.equal(decision.payload.status, "pending");
});

test("Equipo bloquea agregar nuevamente al mismo kinesiologo", () => {
  const decision = decideClinicProfessionalMembership({
    activeLink: {
      id: "link-a",
      status: "accepted",
    },
    clinicId: "clinic-a",
    inactiveLink: null,
    lookup: {
      email: "kine@email.com",
      exists: true,
      id: "professional-a",
    },
  });

  assert.equal(decision.type, "duplicate");
  assert.equal(decision.message, "Este kinesiologo ya pertenece a la clinica");
});

test("Equipo informa una invitacion pendiente duplicada", () => {
  const decision = decideClinicProfessionalMembership({
    activeLink: {
      id: "link-a",
      status: "pending",
    },
    clinicId: "clinic-a",
    inactiveLink: null,
    lookup: {
      email: "nuevo@email.com",
      exists: false,
      id: null,
    },
  });

  assert.equal(decision.type, "duplicate");
  assert.equal(decision.message, "La invitacion ya se encuentra pendiente");
});

test("Equipo reactiva un kinesiologo inactivo", () => {
  const decision = decideClinicProfessionalMembership({
    activeLink: null,
    clinicId: "clinic-a",
    inactiveLink: {
      id: "link-inactive",
      status: "inactive",
    },
    lookup: {
      email: "kine@email.com",
      exists: true,
      id: "professional-a",
    },
    now: "2026-07-08T12:00:00.000Z",
  });

  assert.equal(decision.type, "reactivate");
  assert.equal(decision.id, "link-inactive");
  assert.equal(decision.payload.professional_id, "professional-a");
  assert.equal(decision.payload.responded_at, "2026-07-08T12:00:00.000Z");
  assert.equal(decision.payload.status, "accepted");
});

test("Equipo rechaza status invalido para clinic_professionals", () => {
  assert.throws(
    () => assertClinicProfessionalStatus("active"),
    /Status de kinesiologo de clinica invalido/,
  );
});

test("Equipo permite que un usuario trabaje en mas de una clinica", () => {
  const decision = decideClinicProfessionalMembership({
    activeLink: null,
    clinicId: "clinic-b",
    inactiveLink: null,
    lookup: {
      email: "kine@email.com",
      exists: true,
      id: "professional-a",
    },
  });

  assert.equal(decision.type, "insert");
  assert.equal(decision.payload.clinic_id, "clinic-b");
  assert.equal(decision.payload.professional_id, "professional-a");
  assert.equal(decision.payload.status, "accepted");
});

test("Nuevo turno en workspace de clinica usa turno clinico para kinesiologo invitado", () => {
  const page = fs.readFileSync(
    "src/app/dashboard/turnos/nuevo/page.tsx",
    "utf8",
  );

  assert.match(page, /const isClinicWorkspace = activeWorkspace\?\.type === "CLINICA"/);
  assert.match(page, /if \(isClinicWorkspace\)/);
  assert.match(page, /const isClinicProfessional =/);
  assert.match(page, /professional\.professional_id === user\?\.id/);
  assert.match(page, /await addClinicAppointment/);
  assert.match(page, /\{isClinicAdmin \? \(/);
  assert.match(page, /\(isClinicAdmin && clinicProfessionals\.length === 0\)/);
});

test("Pacientes validan DNI duplicado, contacto minimo y edicion segura", () => {
  const patientsHook = fs.readFileSync("src/hooks/usePatients.ts", "utf8");
  const patientsPage = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");
  const newPatientModal = fs.readFileSync(
    "src/components/patients/NuevoPacienteModal.tsx",
    "utf8",
  );
  const migration = fs.readFileSync(
    "supabase/migrations/202606050002_validate_patient_identity_and_contact.sql",
    "utf8",
  );

  [patientsHook, patientsPage, migration].forEach((source) => {
    assert.match(source, /Ingres(?:a|á) al menos un medio de contacto/);
  });

  [patientsHook, migration].forEach((source) => {
    assert.match(source, /Ya ten(?:e|é)s un paciente registrado con ese DNI/);
  });

  assert.match(patientsHook, /findDuplicatePatient/);
  assert.match(patientsHook, /\.neq\("id", params\.excludePatientId\)/);
  assert.match(patientsHook, /\.eq\("owner_id", sessionData\.user\.id\)/);
  assert.match(patientsHook, /\.select\("id"\)/);
  assert.match(patientsHook, /updatePatient/);
  assert.match(patientsPage, /Editar paciente/);
  assert.match(newPatientModal, /Crear tratamiento inicial/);
  assert.match(patientsPage, /addTreatment/);
  assert.match(patientsPage, /initialTreatment/);
  assert.match(patientsPage, /Paciente actualizado correctamente/);
  assert.match(migration, /patients\.owner_id = new\.owner_id/);
  assert.match(migration, /patients\.id is distinct from new\.id/);
  assert.doesNotMatch(migration, /update of document_number, full_name, phone, email, initial_condition, status/);
});

test("Nuevo paciente se abre en modal accesible sin cambiar la logica de alta", () => {
  const patientsPage = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");
  const newPatientModal = fs.readFileSync(
    "src/components/patients/NuevoPacienteModal.tsx",
    "utf8",
  );

  assert.match(patientsPage, /<NuevoPacienteModal/);
  assert.match(patientsPage, /onSubmit=\{handleSubmit\}/);
  assert.match(patientsPage, /onUpdateField=\{updateField\}/);
  assert.match(patientsPage, /onUpdateInitialTreatmentField=\{updateInitialTreatmentField\}/);
  assert.match(patientsPage, /setShowForm\(true\)/);
  assert.doesNotMatch(patientsPage, /className="mt-4 rounded-lg border border-ocean-100 bg-white p-4 shadow-card sm:mt-6 sm:p-5"[\s\S]*onSubmit=\{handleSubmit\}/);
  assert.match(newPatientModal, /role="dialog"/);
  assert.match(newPatientModal, /aria-modal="true"/);
  assert.match(newPatientModal, /document\.body\.style\.overflow = "hidden"/);
  assert.match(newPatientModal, /event\.key === "Escape"/);
  assert.match(newPatientModal, /event\.target === event\.currentTarget/);
  assert.match(newPatientModal, /firstInputRef\.current\?\.focus\(\)/);
  assert.match(newPatientModal, /focusableSelector/);
});

test("Listado de pacientes permite reactivar, ordenar y alternar vista", () => {
  const patientsHook = fs.readFileSync("src/hooks/usePatients.ts", "utf8");
  const patientsPage = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");
  const appointmentsHook = fs.readFileSync("src/hooks/useAppointments.ts", "utf8");

  assert.match(patientsHook, /\.order\("status", \{ ascending: true \}\)/);
  assert.match(patientsHook, /\.order\("full_name", \{ ascending: true \}\)/);
  assert.match(patientsHook, /assigned_professional_id/);
  assert.match(patientsHook, /can_view_assigned_patients/);
  assert.match(patientsHook, /\.is\("clinic_id", null\)/);
  assert.match(patientsHook, /\.eq\("assigned_professional_id", user\.id\)/);
  assert.match(appointmentsHook, /\.eq\("owner_id", sessionData\.user\.id\)/);
  assert.match(appointmentsHook, /workspace_id, patient_id/);
  assert.match(appointmentsHook, /originColor/);
  assert.match(patientsHook, /async function reactivatePatient/);
  assert.match(patientsHook, /status: "active"/);
  assert.match(patientsHook, /disabled_at: null/);
  assert.match(patientsHook, /lastPaymentStatus/);
  assert.match(patientsPage, /FileText/);
  assert.match(patientsPage, /Pencil/);
  assert.match(patientsPage, /UserX/);
  assert.match(patientsPage, /UserCheck/);
  assert.match(patientsPage, /window\.confirm/);
  assert.match(patientsPage, /title="Ver historial"/);
  assert.match(patientsPage, /title="Nuevo turno"/);
  assert.match(patientsPage, /title="Editar paciente"/);
  assert.match(patientsPage, /title="Deshabilitar"/);
  assert.match(patientsPage, /title="Reactivar"/);
  assert.match(patientsPage, /Paciente reactivado correctamente/);
  assert.match(patientsPage, /kineflow\.patients\.view/);
  assert.match(patientsPage, /viewMode === "list"/);
  assert.match(patientsPage, /ACTIVOS/);
  assert.match(patientsPage, /INACTIVOS/);
  assert.match(patientsPage, /Buscar por nombre completo o DNI|Buscar por nombre, DNI/);
});

test("Ficha del paciente separa historial y carga de evolucion en modal", () => {
  const source = fs.readFileSync("src/app/dashboard/pacientes/[id]/page.tsx", "utf8");

  assert.match(source, /xl:grid-cols-\[minmax\(0,0\.9fr\)_minmax\(0,1\.1fr\)\]/);
  assert.match(source, /Resumen econ/);
  assert.match(source, /Última sesión cobrada/);
  assert.match(source, /Tratamientos/);
  assert.match(source, /Evoluciones \/ Sesiones/);
  assert.match(source, /evolutionModalOpen/);
  assert.match(source, /openNewEvolutionModal/);
  assert.match(source, /Nueva evoluci/);
  assert.match(source, /setEvolutionModalOpen\(false\)/);
  assert.match(source, /Ver detalle cl/);
  assert.match(source, /Editar cobro/);
  assert.match(source, /Reprogramar/);
  assert.match(source, /Cancelar/);
});

test("Dashboard y cobros distinguen asistencia, deuda y pago registrado", () => {
  const dashboard = fs.readFileSync("src/app/dashboard/page.tsx", "utf8");
  const appointmentsPage = fs.readFileSync("src/app/dashboard/turnos/page.tsx", "utf8");
  const appointmentsHook = fs.readFileSync("src/hooks/useAppointments.ts", "utf8");

  assert.match(dashboard, /Pendiente asistencia/);
  assert.match(dashboard, /Sin cobrar/);
  assert.match(dashboard, /Pendiente de cobro/);
  assert.match(dashboard, /Estado de asistencia/);
  assert.match(dashboard, /Estado de cobro/);
  assert.match(appointmentsPage, /Seleccionar medio/);
  assert.match(appointmentsPage, /required/);
  assert.doesNotMatch(appointmentsPage, /Estado de cobro/);
  assert.doesNotMatch(appointmentsPage, /Fecha de cobro/);
  assert.match(appointmentsHook, /payment_status: "paid"/);
  assert.match(appointmentsHook, /paid_at: new Date\(\)\.toISOString\(\)/);
});

test("Usuarios sobre el limite Free no pueden crear actividad nueva", () => {
  const helper = fs.readFileSync("src/lib/patient-plan-limit.ts", "utf8");
  const patientsPage = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");
  const appointmentsPage = fs.readFileSync("src/app/dashboard/turnos/page.tsx", "utf8");
  const newAppointmentPage = fs.readFileSync(
    "src/app/dashboard/turnos/nuevo/page.tsx",
    "utf8",
  );
  const patientDetailPage = fs.readFileSync(
    "src/app/dashboard/pacientes/[id]/page.tsx",
    "utf8",
  );
  const appointmentsHook = fs.readFileSync("src/hooks/useAppointments.ts", "utf8");
  const evolutionsHook = fs.readFileSync("src/hooks/useEvolutions.ts", "utf8");
  const migration = fs.readFileSync(
    "supabase/migrations/202606050003_enforce_patient_limit_on_activity.sql",
    "utf8",
  );

  [helper, migration].forEach((source) => {
    assert.match(source, /Tu plan Free permite hasta/);
    assert.match(source, /Archiv(?:a|á) pacientes o reactiv(?:a|á) tu plan/);
  });

  [patientsPage, appointmentsPage, patientDetailPage].forEach((source) => {
    assert.match(source, /Reactivar plan/);
    assert.match(source, /patientLimitBlock/);
    assert.match(source, /title=\{patientLimitBlock/);
  });
  assert.match(newAppointmentPage, /Plan Free: hasta 5 pacientes/);
  assert.match(newAppointmentPage, /patientLimitBlock/);
  assert.match(newAppointmentPage, /title=\{patientLimitBlock/);

  assert.match(appointmentsHook, /getPatientPlanLimitBlock/);
  assert.match(appointmentsHook, /throw new Error\(patientLimitBlock\)/);
  assert.match(evolutionsHook, /getPatientPlanLimitBlock/);
  assert.match(evolutionsHook, /throw new Error\(patientLimitBlock\)/);
  assert.match(migration, /join public\.plans on plans\.id = subscriptions\.plan_id/);
  assert.match(migration, /plans\.max_patients/);
  assert.match(migration, /where plans\.code = 'FREE'/);
  assert.match(migration, /create trigger enforce_appointment_patient_limit/);
  assert.match(migration, /create trigger enforce_evolution_patient_limit/);
  assert.match(migration, /before insert on public\.appointments/);
  assert.match(migration, /before insert on public\.evolutions/);
});

test("Links legales existen", () => {
  [
    "src/app/terminos-y-condiciones/page.tsx",
    "src/app/politica-de-privacidad/page.tsx",
    "src/app/suscripciones-cancelaciones-y-reembolsos/page.tsx",
    "src/app/arrepentimiento/page.tsx",
  ].forEach((path) => assert.equal(fs.existsSync(path), true, path));
});

test("Tratamientos vinculan sesiones, turnos y evoluciones", () => {
  const treatmentsHook = fs.readFileSync("src/hooks/useTreatments.ts", "utf8");
  const appointmentsHook = fs.readFileSync("src/hooks/useAppointments.ts", "utf8");
  const evolutionsHook = fs.readFileSync("src/hooks/useEvolutions.ts", "utf8");
  const patientPage = fs.readFileSync(
    "src/app/dashboard/pacientes/[id]/page.tsx",
    "utf8",
  );
  const newAppointmentPage = fs.readFileSync(
    "src/app/dashboard/turnos/nuevo/page.tsx",
    "utf8",
  );
  const statusRoute = fs.readFileSync(
    "src/app/api/appointments/status/route.ts",
    "utf8",
  );
  const migration = fs.readFileSync(
    "supabase/migrations/202606050004_add_treatments_model.sql",
    "utf8",
  );

  assert.match(treatmentsHook, /from\("treatments"\)/);
  assert.match(treatmentsHook, /status: "EN_CURSO"/);
  assert.match(treatmentsHook, /updateTreatmentStatus/);
  assert.match(patientPage, /Nuevo tratamiento/);
  assert.match(patientPage, /Tratamientos/);
  assert.match(patientPage, /Ver sesiones/);
  assert.match(patientPage, /ABANDONADO/);
  assert.match(appointmentsHook, /treatment_id: input\.treatmentId \|\| null/);
  assert.match(appointmentsHook, /session_number: input\.sessionNumber \?\? null/);
  assert.match(appointmentsHook, /fetch\("\/api\/appointments\/status"/);
  assert.match(newAppointmentPage, /useTreatments\(appointment\.patientId/);
  assert.match(newAppointmentPage, /updateTreatment/);
  assert.match(newAppointmentPage, /usedSessions \+ 1/);
  assert.match(newAppointmentPage, /Este paciente no tiene tratamientos activos/);
  assert.match(newAppointmentPage, /href=\{`\/dashboard\/pacientes\/\$\{appointment\.patientId\}`\}/);
  assert.match(newAppointmentPage, /ficha/);
  assert.doesNotMatch(newAppointmentPage, /Crear tratamiento/);
  assert.match(evolutionsHook, /treatment_id: input\.treatmentId \|\| null/);
  assert.match(statusRoute, /getSupabaseAdminClient/);
  assert.match(statusRoute, /from\("treatments"\)/);
  assert.match(statusRoute, /used_sessions: usedSessions/);
  assert.match(statusRoute, /FINALIZADO/);
  assert.match(migration, /create table if not exists public\.treatments/);
  assert.match(migration, /add column if not exists treatment_id uuid references public\.treatments/);
  assert.match(migration, /alter table public\.evolutions/);
  assert.match(migration, /evolutions_treatment_id_idx/);
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

test("Guard de sesion tiene timeout para no quedar tildado tras volver de pagos", () => {
  const source = fs.readFileSync("src/hooks/useRequireAuth.ts", "utf8");

  assert.match(source, /AUTH_VERIFY_TIMEOUT_MS/);
  assert.match(source, /auth_verify_timeout/);
  assert.match(source, /withTimeout\(\s*supabase\.auth\.getSession\(\)/);
  assert.match(source, /withTimeout\([\s\S]*\.from\("profiles"\)/);
});

test("Eventos de auth no recargan dashboard en refresh de token", () => {
  assert.equal(getAuthRouteKind("/dashboard"), "dashboard");
  assert.equal(getAuthRouteKind("/dashboard/pacientes"), "dashboard");
  assert.equal(getAuthRouteKind("/login"), "login");
  assert.equal(getAuthRouteKind("/"), "public");

  assert.equal(
    decideAuthEvent({
      currentUserId: null,
      event: "SIGNED_IN",
      hasLoadedSessionContext: false,
      routeKind: "login",
      sessionUserId: "user-a",
    }),
    "redirect-dashboard",
  );
  assert.equal(
    decideAuthEvent({
      currentUserId: "user-a",
      event: "SIGNED_IN",
      hasLoadedSessionContext: true,
      routeKind: "dashboard",
      sessionUserId: "user-a",
    }),
    "keep-session",
  );
  assert.equal(
    decideAuthEvent({
      currentUserId: "user-a",
      event: "TOKEN_REFRESHED",
      hasLoadedSessionContext: true,
      routeKind: "dashboard",
      sessionUserId: "user-a",
    }),
    "keep-session",
  );
  assert.equal(
    decideAuthEvent({
      currentUserId: "user-a",
      event: "USER_UPDATED",
      hasLoadedSessionContext: true,
      routeKind: "dashboard",
      sessionUserId: "user-a",
    }),
    "keep-session",
  );
  assert.equal(
    decideAuthEvent({
      currentUserId: null,
      event: "INITIAL_SESSION",
      hasLoadedSessionContext: false,
      routeKind: "dashboard",
      sessionUserId: "user-a",
    }),
    "load-session-context",
  );
  assert.equal(
    decideAuthEvent({
      currentUserId: "user-a",
      event: "SIGNED_OUT",
      hasLoadedSessionContext: true,
      routeKind: "dashboard",
      sessionUserId: null,
    }),
    "redirect-login",
  );
  assert.equal(
    decideAuthEvent({
      currentUserId: "user-a",
      event: "SIGNED_IN",
      hasLoadedSessionContext: true,
      routeKind: "dashboard",
      sessionUserId: "user-b",
    }),
    "load-session-context",
  );
});

test("Listener de auth se limpia y no fuerza refresh o polling del dashboard", () => {
  const provider = fs.readFileSync("src/contexts/AuthSessionContext.tsx", "utf8");
  const authPolicy = fs.readFileSync("src/lib/auth-event-policy.ts", "utf8");
  const login = fs.readFileSync("src/app/login/page.tsx", "utf8");
  const register = fs.readFileSync("src/app/registro/page.tsx", "utf8");
  const sidebar = fs.readFileSync("src/components/layout/DashboardSidebar.tsx", "utf8");

  assert.match(provider, /supabase\.auth\.onAuthStateChange/);
  assert.match(provider, /listener\.subscription\.unsubscribe\(\)/);
  assert.match(authPolicy, /TOKEN_REFRESHED/);
  assert.match(provider, /decision === "keep-session"/);
  assert.match(provider, /loadSessionContextInFlightRef/);
  assert.match(provider, /if \(loadSessionContextInFlightRef\.current\)/);
  assert.doesNotMatch(provider, /setInterval|refetchInterval|refreshInterval/);
  assert.doesNotMatch(login, /router\.refresh\(\)/);
  assert.doesNotMatch(register, /router\.refresh\(\)/);
  assert.doesNotMatch(sidebar, /router\.refresh\(\)/);
  assert.match(sidebar, /prefetch=\{false\}/);
});

test("Usuario historico particular sin workspace se recupera al iniciar sesion", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202607220001_recover_historical_personal_workspaces.sql",
    "utf8",
  );
  const provider = fs.readFileSync("src/contexts/AuthSessionContext.tsx", "utf8");
  const route = fs.readFileSync(
    "src/app/api/workspaces/ensure-personal/route.ts",
    "utf8",
  );

  assert.match(migration, /create or replace function public\.ensure_kinesiologist_personal_workspace/);
  assert.match(migration, /add column if not exists workspace_id uuid references public\.workspaces/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /profiles\.account_type = 'KINESIOLOGO'/);
  assert.match(migration, /not exists \([\s\S]*workspaces\.type = 'PERSONAL'/);
  assert.match(migration, /'PERSONAL'[\s\S]*'ADMIN'[\s\S]*'accepted'/);
  assert.match(provider, /ensurePersonalWorkspace\(data\.session\.access_token\)/);
  assert.match(provider, /!workspaceRows\.some\(\(workspace\) => workspace\.type === "PERSONAL"\)/);
  assert.match(route, /supabase\.auth\.getUser\(token\)/);
  assert.match(route, /admin\.rpc\([\s\S]*ensure_kinesiologist_personal_workspace/);
});

test("Recuperacion de workspace particular es idempotente y no duplica usuarios existentes", () => {
  const workspaceMigration = fs.readFileSync(
    "supabase/migrations/202606300001_add_workspaces_foundation.sql",
    "utf8",
  );
  const recoveryMigration = fs.readFileSync(
    "supabase/migrations/202607220001_recover_historical_personal_workspaces.sql",
    "utf8",
  );

  assert.match(workspaceMigration, /create unique index if not exists workspaces_personal_owner_uidx/);
  assert.match(workspaceMigration, /where type = 'PERSONAL'/);
  assert.match(workspaceMigration, /create unique index if not exists workspace_members_active_user_uidx/);
  assert.match(recoveryMigration, /on conflict do nothing/g);
  assert.match(recoveryMigration, /select workspaces\.id[\s\S]*where workspaces\.type = 'PERSONAL'[\s\S]*workspaces\.owner_id = target_user_id/);
});

test("Recuperacion conserva datos historicos del particular y los asocia al workspace personal", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202607220001_recover_historical_personal_workspaces.sql",
    "utf8",
  );

  assert.match(migration, /update public\.patients[\s\S]*patients\.workspace_id is null[\s\S]*patients\.owner_id = target_user_id[\s\S]*patients\.clinic_id is null/);
  assert.match(migration, /update public\.appointments[\s\S]*appointments\.workspace_id is null[\s\S]*appointments\.owner_id = target_user_id[\s\S]*appointments\.clinic_id is null/);
  assert.match(migration, /update public\.evolutions[\s\S]*evolutions\.workspace_id is null[\s\S]*evolutions\.owner_id = target_user_id/);
  assert.match(migration, /update public\.treatments[\s\S]*treatments\.workspace_id is null[\s\S]*treatments\.owner_id = target_user_id/);
  assert.match(migration, /update public\.subscriptions[\s\S]*subscriptions\.workspace_id is null[\s\S]*subscriptions\.account_id = target_user_id[\s\S]*subscriptions\.account_type = 'KINESIOLOGO'/);
  assert.doesNotMatch(migration, /delete from public\.(patients|appointments|evolutions|treatments|subscriptions)/);
});

test("Recuperacion respeta clinicas y kinesiologos miembros de clinicas", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202607220001_recover_historical_personal_workspaces.sql",
    "utf8",
  );
  const provider = fs.readFileSync("src/contexts/AuthSessionContext.tsx", "utf8");
  const route = fs.readFileSync(
    "src/app/api/workspaces/ensure-personal/route.ts",
    "utf8",
  );

  assert.match(migration, /coalesce\(target_profile\.account_type, 'KINESIOLOGO'\) <> 'KINESIOLOGO'[\s\S]*return null/);
  assert.doesNotMatch(migration, /insert into public\.clinics/);
  assert.match(migration, /patients\.clinic_id is null/);
  assert.match(migration, /appointments\.clinic_id is null/);
  assert.match(provider, /workspaceRows\.some\(\(workspace\) => workspace\.type === "PERSONAL"\)/);
  assert.match(route, /\(profile\?\.account_type \?\? "KINESIOLOGO"\) !== "KINESIOLOGO"/);
});

test("Links publicos visibles no hacen prefetch automatico en auth", () => {
  const logo = fs.readFileSync("src/components/ui/Logo.tsx", "utf8");
  const legalLinks = fs.readFileSync("src/components/layout/LegalLinks.tsx", "utf8");
  const publicNavbar = fs.readFileSync("src/components/layout/PublicNavbar.tsx", "utf8");
  const login = fs.readFileSync("src/app/login/page.tsx", "utf8");
  const register = fs.readFileSync("src/app/registro/page.tsx", "utf8");
  const recovery = fs.readFileSync("src/app/recuperar-password/page.tsx", "utf8");
  const newPassword = fs.readFileSync("src/app/nueva-password/page.tsx", "utf8");
  const home = fs.readFileSync("src/app/page.tsx", "utf8");

  assert.match(logo, /href="\/" prefetch=\{false\}/);
  assert.match(legalLinks, /prefetch=\{false\}/);
  assert.match(publicNavbar, /href="\/login" prefetch=\{false\}/);
  assert.match(publicNavbar, /href="\/registro" prefetch=\{false\}/);
  assert.match(login, /href="\/recuperar-password"[\s\S]*prefetch=\{false\}/);
  assert.match(login, /href="\/registro"[\s\S]*prefetch=\{false\}/);
  assert.match(register, /href="\/terminos-y-condiciones"[\s\S]*prefetch=\{false\}/);
  assert.match(register, /href="\/politica-de-privacidad"[\s\S]*prefetch=\{false\}/);
  assert.match(register, /href="\/login"[\s\S]*prefetch=\{false\}/);
  assert.match(recovery, /href="\/login"[\s\S]*prefetch=\{false\}/);
  assert.match(newPassword, /href="\/recuperar-password"[\s\S]*prefetch=\{false\}/);
  assert.match(home, /href="\/registro"[\s\S]*prefetch=\{false\}/);
});

test("Pacientes carga paginada sin validar usuario dos veces", () => {
  const hook = fs.readFileSync("src/hooks/usePatients.ts", "utf8");
  const page = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");
  const treatmentsHook = fs.readFileSync("src/hooks/useTreatments.ts", "utf8");
  const loadPatientsBlock = hook.slice(
    hook.indexOf("const loadPatients"),
    hook.indexOf("async function findDuplicatePatient"),
  );

  assert.match(hook, /const \{ accountType, user \} = useRequireAuth\(\)/);
  assert.doesNotMatch(loadPatientsBlock, /supabase\.auth\.getUser\(\)/);
  assert.match(hook, /\.select\([\s\S]*\{ count: "exact" \}/);
  assert.match(hook, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(hook, /if \(patientIds\.length === 0\)/);
  assert.match(hook, /\.from\("appointments"\)[\s\S]*\.in\("patient_id", patientIds\)/);
  assert.match(hook, /\.from\("evolutions"\)[\s\S]*\.in\("patient_id", patientIds\)/);
  assert.match(page, /PATIENTS_PAGE_SIZE = 25/);
  assert.match(page, /usePatients\(\{\s*page: currentPage,\s*pageSize: PATIENTS_PAGE_SIZE,\s*search: query,\s*\}\)/);
  assert.match(page, /useTreatments\(undefined, \{ enabled: false \}\)/);
  assert.match(page, /setCurrentPage\(1\)/);
  assert.match(page, /Mostrando \{pageStart\}-\{pageEnd\} de \{totalCount\} pacientes/);
  assert.match(page, /href=\{`\/dashboard\/pacientes\/\$\{patient\.id\}`\}[\s\S]*prefetch=\{false\}/);
  assert.match(treatmentsHook, /options: \{ enabled\?: boolean \} = \{\}/);
  assert.match(treatmentsHook, /if \(!enabled\)/);
});

test("Ingresos carga solo datos financieros acotados y paginados", () => {
  const page = fs.readFileSync("src/app/dashboard/ingresos/page.tsx", "utf8");
  const hook = fs.readFileSync("src/hooks/useIncomeRecords.ts", "utf8");

  assert.match(page, /useIncomeRecords\(\{/);
  assert.doesNotMatch(page, /useAppointments\(/);
  assert.doesNotMatch(page, /usePatients\(/);
  assert.doesNotMatch(page, /PatientSearchSelect/);
  assert.match(page, /INCOME_PAGE_SIZE = 25/);
  assert.match(page, /America\/Argentina\/Buenos_Aires/);
  assert.match(page, /href=\{`\/dashboard\/pacientes\/\$\{appointment\.patientId\}`\}[\s\S]*prefetch=\{false\}/);

  assert.match(hook, /from\("appointments"\)/);
  assert.match(hook, /scheduled_at/);
  assert.match(hook, /session_amount/);
  assert.match(hook, /payment_status/);
  assert.match(hook, /paid_at/);
  assert.match(hook, /\.range\(from, to\)/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /\.abortSignal\(signal\)/);
  assert.match(hook, /Promise\.all/);
  assert.doesNotMatch(hook, /from\("patients"\)/);
  assert.doesNotMatch(hook, /from\("evolutions"\)/);
  assert.doesNotMatch(hook, /\.in\("patient_id"/);
});

test("Pantallas previas cancelan cargas pendientes al navegar", () => {
  const patientsHook = fs.readFileSync("src/hooks/usePatients.ts", "utf8");
  const appointmentsHook = fs.readFileSync("src/hooks/useAppointments.ts", "utf8");
  const appointmentsLoadBlock = appointmentsHook.slice(
    appointmentsHook.indexOf("const loadAppointments"),
    appointmentsHook.indexOf("async function validateAppointmentSlot"),
  );

  [patientsHook, appointmentsHook].forEach((source) => {
    assert.match(source, /new AbortController\(\)/);
    assert.match(source, /controller\.abort\(\)/);
    assert.match(source, /\.abortSignal\(signal\)/);
    assert.match(source, /signal\?\.aborted/);
  });

  assert.match(appointmentsHook, /const \{ accountType, user \} = useRequireAuth\(\)/);
  assert.doesNotMatch(appointmentsLoadBlock, /supabase\.auth\.getUser\(\)/);
});

test("Links a detalle de paciente no hacen prefetch automatico", () => {
  [
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/ingresos/page.tsx",
    "src/app/dashboard/pacientes/page.tsx",
    "src/app/dashboard/turnos/page.tsx",
    "src/app/dashboard/turnos/nuevo/page.tsx",
  ].forEach((path) => {
    const source = fs.readFileSync(path, "utf8");
    const matches = source.matchAll(/href=\{`\/dashboard\/pacientes\/[^`]+`\}/g);

    for (const match of matches) {
      const nearbySource = source.slice(match.index, match.index + 220);

      assert.match(nearbySource, /prefetch=\{false\}/, path);
    }
  });
});

test("Textos visibles usan UTF-8 sin mojibake", () => {
  const filesToScan = [
    ".editorconfig",
    "src",
    "supabase",
    "tests",
  ];
  const sourceFiles = [];

  function collectFiles(path) {
    const stats = fs.statSync(path);

    if (stats.isDirectory()) {
      fs.readdirSync(path)
        .filter((entry) => !entry.startsWith("."))
        .forEach((entry) => collectFiles(`${path}/${entry}`));
      return;
    }

    if (/\.(css|html|js|jsx|json|md|mjs|sql|ts|tsx)$/.test(path)) {
      sourceFiles.push(path);
    }
  }

  filesToScan.forEach(collectFiles);

  sourceFiles.forEach((path) => {
    const source = fs.readFileSync(path, "utf8");

    assert.doesNotMatch(source, /\u00c3|\u00c2/, path);
  });

  const appointmentUi = fs.readFileSync("src/lib/appointment-ui.ts", "utf8");
  const visibleSource = sourceFiles
    .map((path) => fs.readFileSync(path, "utf8"))
    .join("\n");

  [
    "Asistió",
    "No asistió",
    "Atención",
    "Evolución",
    "Kinesiólogo",
    "Clínica",
    "Sesión",
    "Descripción",
  ].forEach((text) => {
    assert.match(visibleSource, new RegExp(text));
  });
  assert.match(appointmentUi, /appointmentStatusLabels/);
});
