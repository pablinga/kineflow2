// Recorre pantallas × viewports, toma capturas y guarda chequeos en results.json.
// node responsive-audit/audit.mjs [vps separados por coma] [filtro de nombre]
import { openAs, closeBrowser, APP, waitIdle, record, VIEWPORTS } from "./harness.mjs";
import { W_K, W_C } from "./data.mjs";

const vps = (process.argv[2] || Object.keys(VIEWPORTS).join(",")).split(",");
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;

const click = async (page, locator, wait = 900) => { await locator.first().click({ timeout: 15000 }); await page.waitForTimeout(wait); };
async function pickMonday(page) {
  await click(page, page.getByRole("button", { name: "Mes siguiente" }), 2500);
  const cands = page.getByRole("button", { name: /^Lunes, 2 de noviembre|^Lu\s*2$/ });
  const n = await cands.count();
  for (let i = 0; i < n; i += 1) { if (await cands.nth(i).isVisible()) { await cands.nth(i).click(); await page.waitForTimeout(2500); return; } }
  throw new Error("sin lunes visible");
}
const btn = (page, name, exact = false) => page.getByRole("button", { name, exact });

// who, path, wait text, acciones opcionales, fullPage
const SCREENS = [
  // Públicas
  ["pub-landing", "anon", "/", "KineFlow"],
  ["pub-login", "anon", "/login", "Ingres"],
  ["pub-registro", "anon", "/registro", "Cre"],
  ["pub-registro-confirmar", "anon", "/registro/confirmar", "correo"],
  ["pub-recuperar", "anon", "/recuperar-password", null],
  ["pub-terminos", "anon", "/terminos-y-condiciones", null],
  ["pub-privacidad", "anon", "/politica-de-privacidad", null],
  ["pub-reservar-kine", "anon", `/reservar/${W_K}`, "Reserv"],
  ["pub-reservar-kine-horarios", "anon", `/reservar/${W_K}`, "Reserv", async (page) => {
    const slot = page.getByRole("button", { name: /^\d{2}:\d{2}/ });
    await slot.first().waitFor({ timeout: 30000 }).catch(() => {});
    if (!(await slot.count())) { await click(page, btn(page, "Siguiente"), 2500); }
    if (await slot.count()) { await click(page, slot); }
  }],
  ["pub-reservar-clinica", "anon", `/reservar/${W_C}`, "Reserv"],
  // Kinesiólogo particular
  ["kine-inicio", "kine", "/dashboard", "Turnos esta semana"],
  ["kineNew-inicio-checklist", "kineNew", "/dashboard", null],
  ["kine-menu", "kine", "/dashboard", "Turnos esta semana", async (page) => { await click(page, btn(page, "Abrir navegación")); }, false],
  ["kine-agenda-dia", "kine", "/dashboard/turnos?vista=dia", "Registrar evolución"],
  ["kine-agenda-semana", "kine", "/dashboard/turnos", "Nuevo turno", async (page) => { await click(page, btn(page, "Semana", true), 1500); }],
  ["kine-agenda-mes", "kine", "/dashboard/turnos", "Nuevo turno", async (page) => { await click(page, btn(page, "Mes", true), 1500); }],
  ["kine-agenda-mes-modal", "kine", "/dashboard/turnos", "Nuevo turno", async (page) => {
    await click(page, btn(page, "Mes", true), 1500);
    const today = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date()).slice(8));
    const cell = page.locator("div.min-h-24").filter({ hasText: new RegExp(`^${today}`) });
    await click(page, cell.first(), 1200);
  }, false],
  ["kine-agenda-acciones", "kine", "/dashboard/turnos?vista=dia", "Registrar evolución", async (page) => { await click(page, btn(page, "Acciones", true)); }, false],
  ["kine-agenda-cobro", "kine", "/dashboard/turnos?vista=dia", "Registrar evolución", async (page) => { await click(page, btn(page, "Acciones", true)); await click(page, btn(page, "Registrar cobro")); }, false],
  ["kine-agenda-evolucion", "kine", "/dashboard/turnos?vista=dia", "Registrar evolución", async (page) => { await click(page, btn(page, "Registrar evolución")); }, false],
  ["kine-agenda-reprogramar", "kine", "/dashboard/turnos?vista=dia", "Registrar evolución", async (page) => { await click(page, btn(page, "Acciones", true).last()); await click(page, btn(page, "Reprogramar")); }, false],
  ["kine-nuevo-turno", "kine", "/dashboard/turnos/nuevo?paciente=aaaa-p1", "Horarios disponibles", async (page) => {
    const slot = page.getByRole("button", { name: /^\d{2}:\d{2}/ });
    await page.waitForTimeout(2500);
    if (!(await slot.count())) await click(page, btn(page, "Ver semana siguiente"), 2500);
    if (await slot.count()) await click(page, slot);
    await page.getByText("Repetir este turno").first().click().catch(() => {});
    await page.waitForTimeout(600);
    await page.getByLabel("Cantidad de turnos (incluye este)").fill("4").catch(() => {});
    await page.waitForTimeout(2500);
  }],
  ["kine-pacientes", "kine", "/dashboard/pacientes", "Nuevo paciente"],
  ["kine-pacientes-lista", "kine", "/dashboard/pacientes", "Nuevo paciente", async (page) => { await click(page, btn(page, "Lista", true)); }],
  ["kine-paciente-nuevo", "kine", "/dashboard/pacientes", "Nuevo paciente", async (page) => { await click(page, btn(page, "Nuevo paciente"), 1500); }],
  ["kine-paciente-importar", "kine", "/dashboard/pacientes?importar=1", "Importar", null, false],
  ["kine-ficha", "kine", "/dashboard/pacientes/aaaa-p1", "Evoluciones"],
  ["kine-ficha-turnos", "kine", "/dashboard/pacientes/aaaa-p1", "Evoluciones", async (page) => { await click(page, page.getByRole("tab", { name: /Turnos y cobros/ }).or(btn(page, /Turnos y cobros/))); }],
  ["kine-ficha-tratamientos", "kine", "/dashboard/pacientes/aaaa-p1", "Evoluciones", async (page) => { await click(page, page.getByRole("tab", { name: /Evaluación y tratamientos/ }).or(btn(page, /Evaluación y tratamientos/))); }],
  ["kine-ingresos", "kine", "/dashboard/ingresos", "Anterior"],
  ["kine-reportes", "kine", "/dashboard/reportes", "Descargar Excel"],
  ["kine-config-general", "kine", "/dashboard/configuracion", "Guardar"],
  ["kine-config-atencion", "kine", "/dashboard/configuracion", "Guardar", async (page) => { await click(page, btn(page, "Atención y coberturas"), 1500); }],
  ["kine-config-agenda", "kine", "/dashboard/configuracion", "Guardar", async (page) => { await click(page, btn(page, "Agenda", true).last(), 1500); }],
  ["kine-config-notif", "kine", "/dashboard/configuracion", "Guardar", async (page) => { await click(page, btn(page, "Notificaciones", true).last(), 1500); }],
  ["kine-config-perfil", "kine", "/dashboard/configuracion", "Guardar", async (page) => { await click(page, btn(page, "Perfil público"), 2000); }],
  ["kine-planes", "kine", "/dashboard/planes", "Plan"],
  ["kine-reservas-online", "kine", "/dashboard/disponibilidad", null],
  // Clínica
  ["admin-inicio", "admin", "/dashboard", null],
  ["admin-agenda", "admin", "/dashboard/turnos", "Dar y ver turnos"],
  ["admin-dar-turno", "admin", "/dashboard/turnos", "Dar y ver turnos", async (page) => {
    // Lunes próximo (hay lugar)
    await pickMonday(page);
    await click(page, btn(page, "Dar turno"), 1500);
  }, false],
  ["admin-dar-turno-paciente", "admin", "/dashboard/turnos", "Dar y ver turnos", async (page) => {
    await pickMonday(page);
    await click(page, btn(page, "Dar turno"), 1500);
    await page.getByPlaceholder("Nombre, DNI o teléfono").fill("mar");
    await page.waitForTimeout(800);
    await click(page, btn(page, /María de los Ángeles/), 1200);
  }, false],
  ["admin-agenda-acciones", "admin", "/dashboard/turnos", "Dar y ver turnos", async (page) => { await click(page, page.getByRole("button", { name: /Acciones del turno/ }), 900); }, false],
  ["admin-equipo", "admin", "/dashboard/kinesiologos", "Equipo"],
  ["admin-pacientes", "admin", "/dashboard/pacientes", "Nuevo paciente"],
  ["recep-agenda", "recep", "/dashboard/turnos", "Dar y ver turnos"],
  ["recep-dar-turno", "recep", "/dashboard/turnos", "Dar y ver turnos", async (page) => {
    await pickMonday(page);
    await click(page, btn(page, "Dar turno"), 1500);
  }, false],
];

const log = [];
for (const vp of vps) {
  for (const [name, who, path, waitText, action, fullPage = true] of SCREENS) {
    if (filter && !filter.test(name)) continue;
    const { page, context, errors } = await openAs(who, vp);
    try {
      await page.goto(`${APP}${path}`, { timeout: 180000 });
      await waitIdle(page, waitText, 60000);
      let actionError = null;
      if (action) { try { await action(page); } catch (e) { actionError = e.message.split("\n")[0]; console.log(`  acción falló ${name}@${vp}: ${actionError}`); } }
      await record(page, name, vp, { fullPage, extra: { path, who, actionError, errors: errors.slice(0, 3) } });
      // Captura de la pantalla visible al final de la página (barra inferior vs. contenido)
      if (fullPage && vp !== "1280" && vp !== "1024" && who !== "anon") {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(300);
        await page.screenshot({ path: new URL(`./screenshots/${name}__${vp}__bottom.png`, import.meta.url).pathname });
      }
    } catch (e) {
      console.log(`ERROR ${name}@${vp}: ${e.message.split("\n")[0]}`);
      log.push({ name, vp, error: e.message });
    }
    await context.close();
  }
}
await closeBrowser();
console.log("FIN", JSON.stringify(log));
