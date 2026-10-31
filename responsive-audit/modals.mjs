// Abre modales/drawers en celular vertical y horizontal y mide si entran y scrollean.
import { openAs, closeBrowser, APP, waitIdle, SHOTS, VIEWPORTS } from "./harness.mjs";
import { writeFileSync } from "node:fs";

const btn = (page, name, exact = false) => page.getByRole("button", { name, exact });
const click = async (page, loc, wait = 1000) => { await loc.first().click({ timeout: 15000 }); await page.waitForTimeout(wait); };

const CASES = [
  ["acciones-turno", "kine", "/dashboard/turnos?vista=dia", async (p) => { await click(p, btn(p, "Acciones", true)); }],
  ["cobro", "kine", "/dashboard/turnos?vista=dia", async (p) => { await click(p, btn(p, "Acciones", true)); await click(p, btn(p, "Registrar cobro")); }],
  ["evolucion", "kine", "/dashboard/turnos?vista=dia", async (p) => { await click(p, btn(p, "Registrar evolución")); }],
  ["reprogramar", "kine", "/dashboard/turnos?vista=dia", async (p) => { await click(p, btn(p, "Acciones", true).last()); await click(p, btn(p, "Reprogramar")); }],
  ["firma", "kine", "/dashboard/turnos?vista=dia", async (p) => { await click(p, btn(p, "Acciones", true)); await click(p, btn(p, "Firmar planilla")); }],
  ["cancelar-turno", "kine", "/dashboard/turnos?vista=dia", async (p) => { await click(p, btn(p, "Acciones", true).last()); await click(p, btn(p, "Cancelar turno")); }],
  ["nuevo-paciente-eval", "kine", "/dashboard/pacientes", async (p) => { await click(p, btn(p, "Nuevo paciente")); await click(p, p.getByText("Cargar evaluación inicial"), 1500); }],
  ["importar", "kine", "/dashboard/pacientes?importar=1", async (p) => { await p.waitForTimeout(1500); }],
  ["orden-medica", "kine", "/dashboard/pacientes/aaaa-p1", async (p) => {
    const tab = p.getByRole("tab", { name: /Evaluación y tratamientos/ }).or(btn(p, /Evaluación y tratamientos/));
    if (await tab.first().isVisible()) await click(p, tab);
    await click(p, btn(p, "Cargar orden"), 1500);
  }],
  ["evaluacion", "kine", "/dashboard/pacientes/aaaa-p1", async (p) => {
    const tab = p.getByRole("tab", { name: /Evaluación y tratamientos/ }).or(btn(p, /Evaluación y tratamientos/));
    if (await tab.first().isVisible()) await click(p, tab);
    await click(p, btn(p, /^Evaluación$/), 1500);
  }],
  ["tratamiento", "kine", "/dashboard/pacientes/aaaa-p1", async (p) => {
    const tab = p.getByRole("tab", { name: /Evaluación y tratamientos/ }).or(btn(p, /Evaluación y tratamientos/));
    if (await tab.first().isVisible()) await click(p, tab);
    await click(p, btn(p, /^Tratamiento$/), 1500);
  }],
  ["nueva-evolucion-ficha", "kine", "/dashboard/pacientes/aaaa-p1", async (p) => { await click(p, btn(p, "Nueva evolución"), 1500); }],
  ["cobro-ficha", "kine", "/dashboard/pacientes/aaaa-p1", async (p) => { await click(p, btn(p, "Registrar cobro"), 1500); }],
  ["equipo-agregar", "admin", "/dashboard/kinesiologos", async (p) => { await click(p, btn(p, "Agregar profesional"), 1500); }],
  ["clinica-cancelar", "admin", "/dashboard/turnos", async (p) => {
    await click(p, p.getByRole("button", { name: /Acciones del turno/ }).last());
    await click(p, p.getByRole("menuitem", { name: /Cancelar/ }).or(btn(p, /Cancelar turno/)), 1200);
  }],
  ["menu", "kine", "/dashboard", async (p) => { await click(p, btn(p, "Abrir navegación")); }],
  ["pwa-instrucciones", "kine", "/dashboard", async (p) => { await click(p, btn(p, "Abrir navegación")); await click(p, btn(p, "Instalar KineFlow"), 1500); }],
];

const vps = (process.argv[2] || "360,800h").split(",");
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
const out = [];
for (const vp of vps) {
  for (const [name, who, path, action] of CASES) {
    if (filter && !filter.test(name)) continue;
    const { page, context } = await openAs(who, vp);
    try {
      await page.goto(`${APP}${path}`, { timeout: 180000 });
      await waitIdle(page, null);
      await page.waitForTimeout(2500);
      let err = null;
      try { await action(page); } catch (e) { err = e.message.split("\n")[0]; }
      const m = await page.evaluate((vpH) => {
        const H = window.innerHeight; const W = window.innerWidth;
        const overlays = [...document.querySelectorAll("body *")].filter((el) => {
          const st = getComputedStyle(el);
          if (st.position !== "fixed") return false;
          const r = el.getBoundingClientRect();
          return r.width >= W * 0.9 && r.height >= H * 0.9 && Number(st.zIndex || 0) >= 40 && el.children.length;
        });
        const res = [];
        for (const ov of overlays) {
          // panel = hijo más grande
          const panel = [...ov.querySelectorAll(":scope > *")].sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
          if (!panel) continue;
          const r = panel.getBoundingClientRect();
          const scrollable = (el) => { const s = getComputedStyle(el); return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1; };
          let canScroll = scrollable(ov) || scrollable(panel) || [...panel.querySelectorAll("*")].some((e) => scrollable(e) && e.getBoundingClientRect().height > 100);
          // botones fuera de pantalla
          const offBtns = [...panel.querySelectorAll("button")].filter((b) => { const br = b.getBoundingClientRect(); return br.height > 0 && (br.bottom > H + 1 || br.top < -1); }).map((b) => (b.innerText || b.getAttribute("aria-label") || "").trim().slice(0, 30));
          const nav = [...document.querySelectorAll("nav")].find((n) => getComputedStyle(n).position === "fixed" && n.getBoundingClientRect().bottom >= H - 2 && n.offsetParent !== null);
          res.push({ overlayCls: (ov.getAttribute("class") || "").slice(0, 90), top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width), H, W, fits: r.top >= -1 && r.bottom <= H + 1, canScroll, offBtns, navZ: nav ? getComputedStyle(nav).zIndex : null, ovZ: getComputedStyle(ov).zIndex });
        }
        return res;
      });
      await page.screenshot({ path: `${SHOTS}modal-${name}__${vp}.png` });
      const row = { name, vp, err, m };
      out.push(row);
      console.log(name, vp, err ?? "", JSON.stringify(m));
    } catch (e) { console.log("ERROR", name, vp, e.message.split("\n")[0]); }
    await context.close();
  }
}
writeFileSync(new URL("./modals.json", import.meta.url).pathname, JSON.stringify(out, null, 1));
await closeBrowser();
console.log("FIN");
