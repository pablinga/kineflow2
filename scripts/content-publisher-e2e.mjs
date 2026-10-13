// E2E del publicador de contenido (dry_run) contra el dev server y un Supabase
// falso en memoria (scripts/content-fake-supabase.mjs). Playwright temporal:
//
//   node scripts/content-fake-supabase.mjs &
//   ADMIN_USERNAME=qa-admin ADMIN_PASSWORD_HASH=scrypt:x:y \
//   ADMIN_SESSION_SECRET=$(printf 's%.0s' {1..48}) \
//   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54329 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake \
//   SUPABASE_SERVICE_ROLE_KEY=fake NEXT_PUBLIC_APP_URL=http://localhost:3100 \
//   CONTENT_APPROVAL_SECRET=$(printf 'a%.0s' {1..40}) CONTENT_AGENT_SECRET=$(printf 'b%.0s' {1..40}) \
//   CRON_SECRET=cron-test-secret npx next dev -p 3100 &
//   npm install --no-save playwright   # o con executablePath de Chromium
//   node scripts/content-publisher-e2e.mjs
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createApprovalToken } from "../src/lib/content/approval-token.ts";

const APP = "http://localhost:3100";
const FAKE = "http://localhost:54329";
const SP = process.env.SHOTS_DIR || "/tmp/content-e2e";
mkdirSync(`${SP}/shots`, { recursive: true });
const AGENT = "b".repeat(40);
const APPROVAL_SECRET = "a".repeat(40);
// Misma firma que src/lib/admin-auth.ts con las variables de arriba.
const COOKIE = (() => {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const nonce = randomBytes(8).toString("base64url");
  const sig = createHmac("sha256", "s".repeat(48)).update(`v1.${exp}.${nonce}.qa-admin.scrypt:x:y`).digest("base64url");
  return `v1.${exp}.${nonce}.${sig}`;
})();
const state = async () => (await fetch(`${FAKE}/__state`)).json();
const log = (msg) => console.log(`ok - ${msg}`);

await fetch(`${FAKE}/__reset`);

// 1. Sin acceso
let r = await fetch(`${APP}/admin/contenido`, { redirect: "manual" });
assert.ok([307, 308].includes(r.status) && r.headers.get("location").includes("/admin/login"), `panel sin sesión: ${r.status}`);
r = await fetch(`${APP}/api/admin/content`, { body: "{}", method: "POST" });
assert.equal(r.status, 401);
r = await fetch(`${APP}/api/admin/content/x/action`, { body: '{"action":"approve"}', method: "POST" });
assert.equal(r.status, 401);
r = await fetch(`${APP}/api/admin/content/drafts`, { body: "{}", headers: { authorization: "Bearer otro" }, method: "POST" });
assert.equal(r.status, 401);
r = await fetch(`${APP}/api/cron/content-publish`);
assert.equal(r.status, 401);
log("sin sesión admin / sin secretos: 401 o redirección al login");

// 2. API del agente
const tomorrow = new Date(Date.now() + 36 * 3600_000).toISOString();
const draft = (extra = {}) => ({
  campaign: "lanzamiento", caption: "Tus pacientes reservan solos.", channels: ["instagram", "facebook"],
  hashtags: ["kinesiologia"], scheduledAt: tomorrow, template: "frase",
  title: "Tus pacientes reservan solos", subtitle: "Turnos online y recordatorios", ...extra,
});
const agent = (body) => fetch(`${APP}/api/admin/content/drafts`, {
  body: JSON.stringify(body), headers: { authorization: `Bearer ${AGENT}`, "content-type": "application/json" }, method: "POST",
});
r = await agent(draft({ caption: "Escribile a juan@gmail.com" }));
assert.equal(r.status, 400);
assert.match((await r.json()).error, /datos personales/);
r = await agent(draft({ scheduledAt: new Date(Date.now() - 3600_000).toISOString() }));
assert.equal(r.status, 400);
r = await agent(draft({ approved: true, status: "approved" }));
assert.equal(r.status, 201, await r.clone().text());
const created = (await r.json()).drafts;
assert.equal(created.length, 2);
assert.ok(created.every((d) => d.status === "draft"), "el agente solo crea borradores");
let s = await state();
assert.equal(s.content_queue.length, 2);
assert.ok(s.content_queue.every((row) => row.status === "draft" && row.created_by === "agente"));
assert.equal(new Set(s.content_queue.map((row) => row.group_id)).size, 1);
const ig = s.content_queue.find((row) => row.channel === "instagram");
const fb = s.content_queue.find((row) => row.channel === "facebook");
assert.match(ig.link_url, new RegExp(`utm_source=instagram&utm_medium=post&utm_campaign=lanzamiento&utm_content=${ig.id}`));
assert.equal(ig.image_paths.length, 1);
log("agente: rechaza datos personales y fechas pasadas; crea 2 borradores (IG+FB) con UTM e imagen");

// 3. Panel en el celular
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { height: 844, width: 390 } });
await ctx.addCookies([{ domain: "localhost", name: "kf_admin_session", path: "/", value: COOKIE }]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.goto(`${APP}/admin/contenido`);
await page.getByText("Contenido para redes").waitFor({ timeout: 60000 });
await page.getByText("Modo prueba").waitFor();
assert.equal(await page.getByText("Para aprobar (2)").count(), 1);
await page.locator("img[alt='Vista previa de la imagen']").first().waitFor();
const imgOk = await page.locator("img[alt='Vista previa de la imagen']").first().evaluate((img) => img.complete && img.naturalWidth === 1080);
assert.ok(imgOk, "la imagen del borrador carga (1080 px)");
await page.screenshot({ fullPage: true, path: `${SP}/shots/content-panel-390.png` });
log("panel: lista los borradores con la imagen real, avisa modo prueba");

// Alta manual con vista previa
await page.getByRole("button", { name: "Nuevo post" }).click();
await page.getByLabel("Plantilla").selectOption("tip");
await page.getByLabel("Número", { exact: true }).fill("2");
await page.getByLabel("Título", { exact: true }).fill("Confirmá turnos por WhatsApp");
await page.getByLabel("Texto del post").fill("Un tip para tu consultorio.");
await page.getByRole("button", { name: "Previsualizar" }).click();
await page.locator("img[alt='Vista previa 1']").waitFor({ timeout: 60000 });
await page.screenshot({ fullPage: true, path: `${SP}/shots/content-new-390.png` });
await page.getByRole("button", { name: "Guardar borrador" }).click();
await page.getByText("Borrador guardado.").waitFor({ timeout: 60000 });
s = await state();
assert.equal(s.content_queue.length, 3);
assert.ok(s.content_queue.some((row) => row.created_by === "admin" && row.template === "tip" && row.status === "draft"));
log("panel: alta manual con plantilla tip, vista previa y borrador guardado");

const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert.ok(overflow <= 0, `scroll horizontal ${overflow}`);
log("panel a 390 px sin scroll horizontal");

// 4. Aprobación por link del mail (capturamos el link: mismo formato que el mail)
await fetch(`${APP}/api/cron/content-digest`, { headers: { authorization: "Bearer cron-test-secret" } });
s = await state();
const approveLink = s.content_approval_links.find((link) => link.content_id === ig.id && link.action === "approve");
assert.ok(approveLink, "el resumen crea los links de aprobación");
const token = createApprovalToken(
  { action: "approve", contentId: ig.id, exp: Math.floor(Date.parse(approveLink.expires_at) / 1000), linkId: approveLink.id },
  APPROVAL_SECRET,
);
const mailPage = await ctx.newPage();
await mailPage.goto(`${APP}/contenido/aprobacion?t=${encodeURIComponent(token)}`);
await mailPage.getByText("¿Aprobás esta publicación?").waitFor();
s = await state();
assert.equal(s.content_queue.find((row) => row.id === ig.id).status, "draft", "el GET no aprueba");
await mailPage.screenshot({ fullPage: true, path: `${SP}/shots/content-approval-390.png` });
await mailPage.getByRole("button", { name: "Confirmar aprobación" }).click();
await mailPage.getByText("Publicación aprobada").waitFor();
s = await state();
assert.equal(s.content_queue.find((row) => row.id === ig.id).status, "approved");
assert.equal(s.content_queue.find((row) => row.id === ig.id).approved_by, "mail");
await mailPage.goto(`${APP}/contenido/aprobacion?t=${encodeURIComponent(token)}`);
await mailPage.getByText("Este link ya se usó").waitFor();
const tampered = token.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
await mailPage.goto(`${APP}/contenido/aprobacion?t=${encodeURIComponent(tampered)}`);
await mailPage.getByText("Link inválido").waitFor();
log("mail: el GET solo confirma, el POST aprueba, el link es de un solo uso y el adulterado no sirve");

// 5. Cron: el aprobado vence y se "publica" en dry_run
await fetch(`${FAKE}/rest/v1/content_queue?id=eq.${ig.id}`, {
  body: JSON.stringify({ scheduled_at: new Date(Date.now() - 60_000).toISOString() }),
  headers: { "content-type": "application/json" }, method: "PATCH",
});
const [run1, run2] = await Promise.all([
  fetch(`${APP}/api/cron/content-publish`, { headers: { authorization: "Bearer cron-test-secret" } }).then((x) => x.json()),
  fetch(`${APP}/api/cron/content-publish`, { headers: { authorization: "Bearer cron-test-secret" } }).then((x) => x.json()),
]);
assert.equal(run1.mode, "dry_run");
const outcomes = [...run1.results, ...run2.results].map((x) => x.outcome);
assert.equal(outcomes.filter((o) => o === "published_dry_run").length, 1, JSON.stringify(outcomes));
s = await state();
assert.equal(s.content_queue.find((row) => row.id === ig.id).status, "published_dry_run");
log("cron: publica en dry_run una sola vez aunque corra dos veces a la vez");

// 6. Publicar ahora desde el panel (FB)
await page.reload();
await page.getByRole("button", { name: /Para aprobar/ }).click();
page.once("dialog", (dialog) => dialog.accept());
const fbCard = page.locator("article", { hasText: "Facebook" }).first();
await fbCard.getByRole("button", { name: "Publicar ahora" }).click();
await page.getByText("Publicado en modo prueba").waitFor({ timeout: 60000 });
s = await state();
assert.equal(s.content_queue.find((row) => row.id === fb.id).status, "published_dry_run");
log("panel: Publicar ahora en QA queda published_dry_run");

assert.deepEqual(errors, []);
await browser.close();
console.log("TODO OK");
