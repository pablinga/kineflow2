import { openAs, closeBrowser, APP, waitIdle, checks, VIEWPORTS } from "./harness.mjs";
const MOBILE_CSS = `@media (max-width:1023px){ .grid.items-start.lg\\:grid-cols-2.xl\\:grid-cols-3, .grid.gap-4.lg\\:grid-cols-3 { grid-template-columns: minmax(0,1fr) !important; } }`;
const DESK_CSS = `main.lg\\:grid-cols-\\[18rem_1fr\\]{ grid-template-columns: 18rem minmax(0,1fr) !important; }`;
const cases = [
  ["kine", "/dashboard", "360", MOBILE_CSS], ["admin", "/dashboard", "360", MOBILE_CSS], ["kine", "/dashboard/turnos?vista=dia", "360", MOBILE_CSS],
  ["kine", "/dashboard/reportes", "1024", DESK_CSS], ["kine", "/dashboard/ingresos", "1024", DESK_CSS], ["admin", "/dashboard/kinesiologos", "1024", DESK_CSS],
  ["kine", "/dashboard/pacientes", "1280", DESK_CSS], ["kine", "/dashboard/reportes", "1280", DESK_CSS],
];
for (const [who, path, vp, css] of cases) {
  const { page, context } = await openAs(who, vp);
  await page.goto(`${APP}${path}`, { timeout: 120000 }); await waitIdle(page, null); await page.waitForTimeout(3000);
  const before = await checks(page, VIEWPORTS[vp].width);
  await page.addStyleTag({ content: css }); await page.waitForTimeout(800);
  const after = await checks(page, VIEWPORTS[vp].width);
  console.log(who, path, vp, "antes", before.scrollWidth, before.innerWidth, "después", after.scrollWidth, after.innerWidth, after.offenders.slice(0,3).map(o=>o.sel.slice(0,50)+"|"+o.text.slice(0,20)));
  if (path === "/dashboard/pacientes") console.log(before.offenders.slice(0,5));
  await context.close();
}
await closeBrowser();
