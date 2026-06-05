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
  assert.match(page, /subscriptionStatus\.status === "ACTIVO"/);
  assert.match(page, /kind === "success" && !isActive[\s\S]*"KineFlow - Particular"/);
  assert.match(page, /Suscripción recibida/);
  assert.match(page, /Plan activo/);
  assert.match(page, /Tu plan est(?:a|á|Ã¡) activo/);
  assert.match(page, /confirmando el pago con Mercado Pago/);
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

test("Webhook Mercado Pago acepta eventos de suscripcion y pago por ruta publica", () => {
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

test("Baja de suscripcion llama a Mercado Pago, usa la ruta publica y registra referencia", () => {
  const source = fs.readFileSync("src/app/api/billing/cancel-subscription/route.ts", "utf8");
  const alias = fs.readFileSync("src/app/api/subscriptions/cancel/route.ts", "utf8");
  const page = fs.readFileSync("src/app/dashboard/planes/page.tsx", "utf8");

  assert.match(source, /cancelMercadoPagoSubscription/);
  assert.match(source, /provider_subscription_id/);
  assert.match(source, /No encontramos una suscripcion activa para cancelar/);
  assert.match(source, /No pudimos cancelar la suscripcion en este momento/);
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
  assert.match(billingServer, /upsert\(subscriptionPayload, \{ onConflict: "account_id" \}\)/);
  assert.match(billingServer, /status: storedStatus/);
  assert.doesNotMatch(billingServer, /estado_plan|limite_pacientes|mercado_pago_status|plan_status|subscription_current_period_end/);
});

test("Limite de pacientes se calcula desde subscriptions y plans", () => {
  const migration = fs.readFileSync(
    "supabase/migrations/202606050001_move_patient_limits_to_subscriptions.sql",
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
});

test("Pacientes validan DNI duplicado, contacto minimo y edicion segura", () => {
  const patientsHook = fs.readFileSync("src/hooks/usePatients.ts", "utf8");
  const patientsPage = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");
  const migration = fs.readFileSync(
    "supabase/migrations/202606050002_validate_patient_identity_and_contact.sql",
    "utf8",
  );

  [patientsHook, patientsPage, migration].forEach((source) => {
    assert.match(source, /Ingres(?:a|á|Ã¡) al menos un medio de contacto/);
  });

  [patientsHook, migration].forEach((source) => {
    assert.match(source, /Ya ten(?:e|é|Ã©)s un paciente registrado con ese DNI/);
  });

  assert.match(patientsHook, /findDuplicatePatient/);
  assert.match(patientsHook, /\.neq\("id", params\.excludePatientId\)/);
  assert.match(patientsHook, /\.eq\("owner_id", sessionData\.user\.id\)/);
  assert.match(patientsHook, /updatePatient/);
  assert.match(patientsPage, /Editar paciente/);
  assert.match(patientsPage, /Paciente actualizado correctamente/);
  assert.match(migration, /patients\.owner_id = new\.owner_id/);
  assert.match(migration, /patients\.id is distinct from new\.id/);
  assert.doesNotMatch(migration, /update of document_number, full_name, phone, email, initial_condition, status/);
});

test("Listado de pacientes permite reactivar, ordenar y alternar vista", () => {
  const patientsHook = fs.readFileSync("src/hooks/usePatients.ts", "utf8");
  const patientsPage = fs.readFileSync("src/app/dashboard/pacientes/page.tsx", "utf8");

  assert.match(patientsHook, /\.order\("status", \{ ascending: true \}\)/);
  assert.match(patientsHook, /\.order\("full_name", \{ ascending: true \}\)/);
  assert.match(patientsHook, /async function reactivatePatient/);
  assert.match(patientsHook, /status: "active"/);
  assert.match(patientsHook, /disabled_at: null/);
  assert.match(patientsHook, /lastPaymentStatus/);
  assert.match(patientsPage, /Reactivar paciente/);
  assert.match(patientsPage, /Paciente reactivado correctamente/);
  assert.match(patientsPage, /kineflow\.patients\.view/);
  assert.match(patientsPage, /viewMode === "list"/);
  assert.match(patientsPage, /ACTIVOS/);
  assert.match(patientsPage, /INACTIVOS/);
  assert.match(patientsPage, /Buscar por nombre completo o DNI|Buscar por nombre, DNI/);
});

test("Ficha del paciente separa historial y carga de evolucion en modal", () => {
  const source = fs.readFileSync("src/app/dashboard/pacientes/[id]/page.tsx", "utf8");

  assert.match(source, /xl:grid-cols-\[0\.75fr_1\.35fr\]/);
  assert.match(source, /Resumen econ/);
  assert.match(source, /Turnos/);
  assert.match(source, /Evoluciones/);
  assert.match(source, /evolutionModalOpen/);
  assert.match(source, /openNewEvolutionModal/);
  assert.match(source, /Nueva evoluci/);
  assert.match(source, /setEvolutionModalOpen\(false\)/);
  assert.match(source, /Ver notas cl/);
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
    assert.match(source, /Archiv(?:a|á|Ã¡) pacientes o reactiv(?:a|á|Ã¡) tu plan/);
  });

  [
    patientsPage,
    appointmentsPage,
    newAppointmentPage,
    patientDetailPage,
  ].forEach((source) => {
    assert.match(source, /Reactivar plan/);
    assert.match(source, /patientLimitBlock/);
    assert.match(source, /title=\{patientLimitBlock/);
  });

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
    "src/app/politica-de-suscripcion-y-baja/page.tsx",
    "src/app/baja-de-servicio/page.tsx",
    "src/app/arrepentimiento/page.tsx",
    "src/app/contacto-soporte/page.tsx",
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
  assert.match(newAppointmentPage, /Crear tratamiento/);
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
