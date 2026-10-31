// Utilidades de la auditoría: contexto con sesión falsa, mocks de /api y chequeos.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("/opt/node-tools/node_modules/playwright/index.js");
import { ADMIN, KINE, KINE_NEW, RECEP, freeSlots, W_K, W_C } from "./data.mjs";

export const APP = process.env.APP_URL || "http://localhost:3100";
export const SHOTS = new URL("./screenshots/", import.meta.url).pathname;
export const RESULTS = new URL(process.env.RESULTS_FILE || "./results.json", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

export const VIEWPORTS = {
  "360": { width: 360, height: 800 },
  "390": { width: 390, height: 844 },
  "412": { width: 412, height: 915 },
  "768": { width: 768, height: 1024 },
  "1024": { width: 1024, height: 768 },
  "1280": { width: 1280, height: 800 },
  "800h": { width: 800, height: 360 },
};
export const MOBILE_KEYS = new Set(["360", "390", "412", "800h"]);

const USERS = { kine: KINE, kineNew: KINE_NEW, admin: ADMIN, recep: RECEP, anon: null };
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

let browser;
export async function getBrowser() {
  browser ??= await chromium.launch();
  return browser;
}
export async function closeBrowser() { await browser?.close(); }

export async function openAs(who, vpKey) {
  const vp = VIEWPORTS[vpKey];
  const mobile = process.env.NOMOBILE ? false : (MOBILE_KEYS.has(vpKey) || vpKey === "768");
  const b = await getBrowser();
  const context = await b.newContext({
    locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires", viewport: vp,
    isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
    userAgent: mobile ? ANDROID_UA : undefined,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const userId = USERS[who];
  if (userId) {
    const session = {
      access_token: `user-${userId}`, expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, refresh_token: "r", token_type: "bearer",
      user: { app_metadata: who === "recep" ? { reception_workspace_id: W_C } : {}, aud: "authenticated", email: "user@kine.test", id: userId, role: "authenticated", user_metadata: {} },
    };
    await page.addInitScript((v) => {
      window.localStorage.setItem("sb-localhost-auth-token", JSON.stringify(v));
      window.localStorage.setItem("sb-supabase-auth-token", JSON.stringify(v));
      // No mostrar el aviso automático de instalación (se audita aparte).
      window.localStorage.setItem("pwa_install_dismissed_at", String(Date.now()));
    }, session);
  }
  await page.route("**/api/appointments/availability**", (route) => {
    const p = new URL(route.request().url()).searchParams;
    route.fulfill({ json: { durationMinutes: 45, holidays: [], slots: freeSlots(p.get("from"), p.get("to"), p.get("professionalId") !== "self") } });
  });
  await page.route("**/api/appointments/confirm-notification", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/appointments/status", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/push/**", (r) => r.fulfill({ json: {} }));
  await page.route("**/api/acquisition/event", (r) => r.fulfill({ json: { ok: true } }));
  await page.route("**/api/reception-invitations**", (r) => r.fulfill({ json: { invitations: [] } }));
  await page.route("**/api/reception-members**", (r) => r.fulfill({ json: { members: [
    { email: "recepcion.turno.manana@centro-integral-kinesico.com.ar", id: "rm1", kind: "account", name: "Carla Recepción Mañana", status: "accepted" },
    { email: "pendiente@centro.test", id: "rm2", kind: "invitation", name: "", status: "pending" },
  ] } }));
  await page.route("**/_vercel/**", (r) => r.fulfill({ body: "" }));
  return { context, page, errors };
}

/** Chequeos automáticos sobre la página actual. */
export async function checks(page, vpWidth) {
  return page.evaluate((vpWidth) => {
    const vw = vpWidth || window.innerWidth;
    const de = document.documentElement;
    const out = { vw, innerWidth: window.innerWidth, vh: window.innerHeight, scrollWidth: de.scrollWidth, hOverflow: de.scrollWidth > vw + 1 || window.innerWidth > vw + 1, offenders: [], smallTargets: [], smallInputs: [], clipped: [], viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null };
    const describe = (el) => {
      let s = el.tagName.toLowerCase();
      if (el.id) s += `#${el.id}`;
      const cls = (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".");
      if (cls) s += `.${cls}`;
      const text = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 50);
      return { sel: s, text };
    };
    const visible = (el) => {
      const st = getComputedStyle(el);
      if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    // Elementos (los más internos) que sobresalen a la derecha sin un ancestro que scrollee.
    const scrollsX = (el) => { const ov = getComputedStyle(el).overflowX; return ov === "auto" || ov === "scroll" || ov === "hidden" || ov === "clip"; };
    const all = [...document.body.querySelectorAll("*")];
    const over = (el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.right > 0 && r.width > 0; };
    for (const el of all) {
      if (!visible(el) || !over(el)) continue;
      if ([...el.children].some((c) => visible(c) && over(c))) continue;
      let p = el.parentElement; let contained = false;
      while (p && p !== document.body) { if (scrollsX(p) && p.getBoundingClientRect().right <= vw + 1) { contained = true; break; } p = p.parentElement; }
      if (contained) continue;
      const r = el.getBoundingClientRect();
      out.offenders.push({ ...describe(el), right: Math.round(r.right), width: Math.round(r.width) });
    }
    out.offenderCount = out.offenders.length; out.offenders = out.offenders.slice(0, 12);
    // Áreas táctiles
    const targets = document.querySelectorAll('a[href], button, [role="button"], input[type="checkbox"], input[type="radio"], select, summary, [role="tab"]');
    for (const el of targets) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue;
      // Si el elemento está dentro de un label que lo agranda, usamos el label
      let w = r.width; let h = r.height;
      const label = el.closest("label");
      if (label) { const lr = label.getBoundingClientRect(); w = Math.max(w, lr.width); h = Math.max(h, lr.height); }
      // Links en línea dentro de párrafo: se ignoran
      if (el.tagName === "A" && getComputedStyle(el).display === "inline" && el.parentElement && ["P", "SPAN", "LI"].includes(el.parentElement.tagName)) continue;
      if (h < 40 || w < 40) out.smallTargets.push({ ...describe(el), w: Math.round(w), h: Math.round(h) });
    }
    // Inputs con fuente < 16px
    for (const el of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), select, textarea")) {
      if (!visible(el)) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.smallInputs.push({ ...describe(el), fontSize: fs, name: el.getAttribute("name") || el.getAttribute("type") || "" });
    }
    // Texto recortado: elementos con overflow hidden y contenido más ancho (no truncate intencional)
    for (const el of all) {
      if (!visible(el) || el.children.length > 0) continue;
      const st = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && st.overflowX !== "visible" && st.textOverflow !== "ellipsis" && el.clientWidth > 0 && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
        out.clipped.push({ ...describe(el), sw: el.scrollWidth, cw: el.clientWidth });
      }
    }
    out.clipped = out.clipped.slice(0, 10);
    // Bottom nav: ¿tapa contenido al final?
    const nav = [...document.querySelectorAll("nav")].find((n) => getComputedStyle(n).position === "fixed" && n.getBoundingClientRect().bottom >= window.innerHeight - 2 && visible(n));
    out.bottomNavHeight = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
    return out;
  }, vpWidth);
}

const results = existsSync(RESULTS) ? JSON.parse(readFileSync(RESULTS, "utf8")) : {};
export async function record(page, name, vpKey, { fullPage = true, extra = {} } = {}) {
  await page.waitForTimeout(400);
  const c = await checks(page, VIEWPORTS[vpKey]?.width);
  const file = `${name}__${vpKey}.png`;
  await page.screenshot({ path: SHOTS + file, fullPage }).catch(async () => page.screenshot({ path: SHOTS + file }));
  results[`${name}__${vpKey}`] = { name, vp: vpKey, file, ...c, ...extra };
  writeFileSync(RESULTS, JSON.stringify(results, null, 1));
  const flag = `${c.hOverflow ? "HSCROLL " : ""}${c.offenders.length ? `off=${c.offenders.length} ` : ""}small=${c.smallTargets.length} inputs<16=${c.smallInputs.length}`;
  console.log(`${name} @${vpKey}: ${flag}`);
  return c;
}

export async function waitIdle(page, text, timeout = 60_000) {
  if (text) await page.getByText(text, { exact: false }).first().waitFor({ timeout }).catch((e) => console.log(`  (no apareció "${text}")`));
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(600);
}
