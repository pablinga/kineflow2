// Reconciliación manual de suscripciones PENDING_PAYMENT contra la API de
// Mercado Pago (no es un cron: se corre a mano).
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/reconcile-mercadopago-subscriptions.mjs           # dry-run
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/reconcile-mercadopago-subscriptions.mjs --apply   # escribe
//   ... --min-age-hours=24   solo filas sin cambios hace al menos N horas
//
// Para cada fila busca la preapproval por external_reference (guardada desde
// 202610090002); si no la encuentra, por email del pagador + plan de
// preaprobación. Con --apply actualiza estado y provider_subscription_id con
// la misma regla que el webhook (src/lib/mercadopago-status.ts). No manda el
// mail de activación.
//
// Usa NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// MERCADOPAGO_ACCESS_TOKEN y, para la búsqueda por email,
// NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID(_CONSULTORIO). MERCADOPAGO_API_URL
// permite apuntar a un mock en pruebas.
import { createClient } from "@supabase/supabase-js";
import {
  buildSubscriptionStatusUpdate,
  mapMercadoPagoStatus,
} from "../src/lib/mercadopago-status.ts";

const apply = process.argv.includes("--apply");
const minAgeHours = Number(
  process.argv.find((arg) => arg.startsWith("--min-age-hours="))?.split("=")[1] ?? 0,
);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const accessToken = (process.env.MERCADOPAGO_ACCESS_TOKEN ?? process.env.MP_ACCESS_TOKEN)?.trim();
const apiUrl = (process.env.MERCADOPAGO_API_URL?.trim() || "https://api.mercadopago.com").replace(/\/$/, "");
const planIds = {
  CONSULTORIO: process.env.NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID_CONSULTORIO?.trim() || null,
  INDEPENDIENTE: process.env.NEXT_PUBLIC_MP_PREAPPROVAL_PLAN_ID?.trim() || null,
};

if (!supabaseUrl || !serviceRoleKey || !accessToken) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o MERCADOPAGO_ACCESS_TOKEN.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function maskEmail(email) {
  const [user, domain] = String(email ?? "").split("@");
  return domain ? `${user.slice(0, 2)}***@${domain}` : "-";
}

async function searchPreapprovals(params) {
  const url = new URL(`${apiUrl}/preapproval/search`);

  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(accessToken.startsWith("TEST-") ? { "X-scope": "stage" } : {}),
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Mercado Pago ${response.status}: ${data?.message ?? "error"}`);
  }

  return data?.results ?? [];
}

/** La autorizada si hay; si no, la más reciente. */
function pickPreapproval(results) {
  const sorted = [...results].sort((a, b) =>
    String(b.date_created ?? "").localeCompare(String(a.date_created ?? "")),
  );
  return sorted.find((item) => item.status === "authorized") ?? sorted[0] ?? null;
}

const cutoff = new Date(Date.now() - minAgeHours * 3600 * 1000).toISOString();
const { data: rows, error } = await admin
  .from("subscriptions")
  .select(
    "id, account_id, workspace_id, status, external_reference, activated_at, canceled_at, current_period_start, updated_at, plans(code)",
  )
  .eq("status", "PENDING_PAYMENT")
  .lte("updated_at", cutoff)
  .order("updated_at", { ascending: true });

if (error) {
  throw new Error(error.message);
}

const accountIds = [...new Set(rows.map((row) => row.account_id))];
const { data: profiles } = accountIds.length
  ? await admin.from("profiles").select("id, email").in("id", accountIds)
  : { data: [] };
const emailByAccount = new Map((profiles ?? []).map((profile) => [profile.id, profile.email]));

console.info(`Modo: ${apply ? "APPLY (escribe)" : "dry-run (no escribe)"}`);
console.info(`Filas PENDING_PAYMENT${minAgeHours ? ` con más de ${minAgeHours} h` : ""}: ${rows.length}\n`);

let toUpdate = 0;
let updated = 0;

for (const row of rows) {
  const planCode = (Array.isArray(row.plans) ? row.plans[0] : row.plans)?.code ?? "?";
  const ageHours = Math.round((Date.now() - new Date(row.updated_at).getTime()) / 3600000);
  const email = emailByAccount.get(row.account_id);
  let matchedBy = "external_reference";
  let results = [];

  try {
    if (row.external_reference) {
      results = await searchPreapprovals({ external_reference: row.external_reference });
    }

    if (results.length === 0 && email) {
      matchedBy = "payer_email";
      results = await searchPreapprovals({
        payer_email: email,
        preapproval_plan_id: planIds[planCode] ?? undefined,
      });
    }
  } catch (searchError) {
    console.info(`- ${row.id} | ${planCode} | ${ageHours} h | ${maskEmail(email)} | error: ${searchError.message}`);
    continue;
  }

  const preapproval = pickPreapproval(results);

  if (!preapproval) {
    console.info(`- ${row.id} | ${planCode} | ${ageHours} h | ${maskEmail(email)} | sin preapproval en Mercado Pago`);
    continue;
  }

  const nextStatus = mapMercadoPagoStatus(preapproval.status);
  console.info(
    `- ${row.id} | ${planCode} | ${ageHours} h | ${maskEmail(email)} | ${matchedBy} → preapproval ${preapproval.id} (${preapproval.status}) → ${nextStatus}`,
  );

  toUpdate += 1;

  if (!apply) {
    continue;
  }

  const { data: linkedElsewhere } = await admin
    .from("subscriptions")
    .select("id")
    .eq("provider", "mercadopago")
    .eq("provider_subscription_id", preapproval.id)
    .neq("id", row.id)
    .maybeSingle();

  if (linkedElsewhere) {
    console.info(`    no se actualiza: la preapproval ya está asociada a ${linkedElsewhere.id}`);
    continue;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("subscriptions")
    .update({ ...buildSubscriptionStatusUpdate(preapproval, row, now), updated_at: now })
    .eq("id", row.id)
    .eq("status", "PENDING_PAYMENT");

  if (updateError) {
    console.info(`    error al actualizar: ${updateError.message}`);
  } else {
    updated += 1;
  }
}

console.info(`\nCon preapproval encontrada: ${toUpdate}.${apply ? ` Actualizadas: ${updated}.` : ""}`);
