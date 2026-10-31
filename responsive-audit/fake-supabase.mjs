// Supabase falso en memoria (PostgREST + auth + storage mínimos) para la auditoría.
// Uso: node responsive-audit/fake-supabase.mjs  (puerto 54331)
import { createServer } from "node:http";
import { buildTables, DASHBOARD_STATS, KINE_NEW, ADMIN, RECEP, W_C } from "./data.mjs";

const PORT = Number(process.env.FAKE_PORT || 54331);
let tables = buildTables();
const unknown = new Set();

const FK = {
  patients: "patient_id", profiles: ["professional_id", "user_id", "owner_id"], plans: "plan_id", clinics: "clinic_id", workspaces: "workspace_id",
  clinic_professionals: "clinic_professional_id", insurance_providers: "insurance_provider_id", art_providers: "art_provider_id",
  treatments: "treatment_id", ar_localities: "locality_id", workspace_members_user_id_fkey: ["user_id"],
};
const TARGET = { workspace_members_user_id_fkey: "profiles" };

function parseDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  const t = Date.parse(v.length === 10 ? `${v}T00:00:00-03:00` : v);
  return Number.isNaN(t) ? null : t;
}
function cmp(a, b) {
  const da = parseDate(a); const db = parseDate(b);
  if (da !== null && db !== null) return da - db;
  const na = Number(a); const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}
function matches(row, key, raw) {
  if (key.includes(".")) return true;
  if (!(key in row)) return true;
  const negate = raw.startsWith("not.");
  const expr = negate ? raw.slice(4) : raw;
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot); const value = decodeURIComponent(expr.slice(dot + 1));
  const cell = row[key];
  let ok = true;
  if (op === "eq") ok = String(cell) === value;
  else if (op === "neq") ok = String(cell) !== value;
  else if (op === "is") ok = value === "null" ? cell == null : String(cell) === value;
  else if (op === "in") ok = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/"/g, "")).includes(String(cell));
  else if (op === "gte") ok = cell != null && cmp(cell, value) >= 0;
  else if (op === "gt") ok = cell != null && cmp(cell, value) > 0;
  else if (op === "lte") ok = cell != null && cmp(cell, value) <= 0;
  else if (op === "lt") ok = cell != null && cmp(cell, value) < 0;
  else if (op === "ilike" || op === "like") {
    const re = new RegExp("^" + value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*") + "$", "i");
    ok = re.test(String(cell ?? ""));
  }
  return negate ? !ok : ok;
}
function filterRows(rows, params) {
  return rows.filter((row) => [...params].every(([key, raw]) => {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) return true;
    if (key === "or" || key.endsWith(".or")) {
      if (key !== "or") return true;
      return raw.replace(/^\(|\)$/g, "").split(",").some((part) => {
        const [column, ...rest] = part.split(".");
        return matches(row, column, rest.join("."));
      });
    }
    return matches(row, key, raw);
  }));
}
function embeds(select) {
  const out = [];
  let depth = 0; let cur = "";
  for (const ch of select ?? "") {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((c) => c.includes("(")).map((c) => {
    const head = c.split("(")[0];
    const [alias, rel] = head.includes(":") ? head.split(":") : [head, head];
    return { alias: alias.trim(), rel: rel.split("!")[0].trim() };
  });
}
function enrich(rows, select) {
  const list = embeds(select);
  if (!list.length) return rows;
  return rows.map((row) => {
    const copy = { ...row };
    for (const { alias, rel } of list) {
      if (copy[alias] !== undefined) continue;
      const target = TARGET[rel] ?? rel;
      const fks = [FK[rel]].flat().filter(Boolean);
      const fk = fks.find((k) => row[k]);
      if (fk && tables[target]) copy[alias] = tables[target].find((t) => t.id === row[fk]) ?? null;
      else if (tables[target]) {
        const back = tables[target].filter((t) => Object.keys(t).some((k) => k.endsWith("_id") && t[k] === row.id));
        copy[alias] = back;
      } else copy[alias] = null;
    }
    return copy;
  });
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-allow-origin": "*", "access-control-expose-headers": "*", "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}
const sessionFor = (id) => ({
  access_token: `user-${id}`, expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, refresh_token: "r", token_type: "bearer",
  user: { app_metadata: {}, aud: "authenticated", email: "x@kine.test", id, role: "authenticated", user_metadata: {} },
});

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204);
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const auth = req.headers.authorization ?? "";
  const userId = auth.startsWith("Bearer user-") ? auth.slice(12) : null;
  const role = auth === "Bearer fake-service" ? "service" : userId ? "user" : "anon";

  if (url.pathname === "/__reset") { tables = buildTables(); return send(res, 200, { ok: true }); }
  if (url.pathname === "/__unknown") return send(res, 200, [...unknown]);
  if (url.pathname.startsWith("/auth/v1/user")) return send(res, 200, sessionFor(userId ?? ADMIN).user);
  if (url.pathname.startsWith("/auth/v1/")) return send(res, 200, sessionFor(userId ?? ADMIN));
  if (url.pathname.startsWith("/storage/v1/")) {
    if (url.pathname.includes("/object/sign/")) return send(res, 200, { signedURL: "/storage/v1/object/fake.pdf?token=x", signedUrl: "http://localhost:54331/storage/v1/object/fake.pdf" });
    if (url.pathname.includes("/object/list/")) return send(res, 200, []);
    return send(res, 200, {});
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = url.pathname.split("/").pop();
    const args = JSON.parse(body || "{}");
    if (fn === "get_account_access_level") return send(res, 200, userId === KINE_NEW ? "TRIAL_ACTIVE" : "PAID_ACTIVE");
    if (fn === "get_dashboard_home") return send(res, 200, userId === KINE_NEW ? { ...DASHBOARD_STATS(), weekAppointments: 0, activePatients: 0, monthCollected: 0, weeklyIncome: [] } : DASHBOARD_STATS());
    if (fn === "get_dashboard_reminders_sent") return send(res, 200, 64);
    if (["is_workspace_admin", "is_clinic_owner"].includes(fn)) return send(res, 200, userId === ADMIN);
    if (fn === "is_workspace_staff") return send(res, 200, userId === ADMIN || userId === RECEP);
    if (fn === "get_clinic_workspace_id") return send(res, 200, W_C);
    if (fn === "search_ar_localities") return send(res, 200, tables.ar_localities);
    if (fn === "check_whatsapp_send_throttle") return send(res, 200, true);
    unknown.add(`rpc:${fn}`);
    return send(res, 200, null);
  }
  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (!table) return send(res, 404, { message: "sin ruta" });
  if (!tables[table]) { unknown.add(table); tables[table] = []; }
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const select = url.searchParams.get("select");

  if (req.method === "POST") {
    const rows = [JSON.parse(body || "{}")].flat().map((r, i) => ({ id: `${table}-new-${Date.now()}-${i}`, created_at: new Date().toISOString(), ...r }));
    tables[table].push(...rows);
    return send(res, 201, single ? rows[0] : rows);
  }
  if (req.method === "PATCH" || req.method === "DELETE") {
    const rows = filterRows(tables[table], url.searchParams);
    return send(res, 200, single ? rows[0] ?? null : rows);
  }
  let rows = filterRows(tables[table], url.searchParams);
  if (role === "user" && table === "workspaces") {
    const member = new Set(tables.workspace_members.filter((m) => m.user_id === userId).map((m) => m.workspace_id));
    rows = rows.filter((w) => w.owner_id === userId || member.has(w.id));
  }
  if (role === "user" && table === "workspace_members" && !url.searchParams.has("user_id") && !url.searchParams.has("workspace_id")) {
    rows = rows.filter((m) => m.user_id === userId);
  }
  const order = url.searchParams.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0].split(".");
    rows = [...rows].sort((a, b) => (dir === "desc" ? -1 : 1) * cmp(a[col] ?? "", b[col] ?? ""));
  }
  const total = rows.length;
  let offset = Number(url.searchParams.get("offset") || 0);
  let limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : null;
  const range = req.headers.range;
  if (range && /^\d+-\d+$/.test(range)) { const [a, b] = range.split("-").map(Number); offset = a; limit = b - a + 1; }
  rows = rows.slice(offset, limit === null ? undefined : offset + limit);
  rows = enrich(rows, select);
  const headers = { "content-range": `${offset}-${Math.max(offset + rows.length - 1, 0)}/${total}` };
  if (req.method === "HEAD") return send(res, 200, undefined, headers);
  if (single) return rows.length ? send(res, 200, rows[0], headers) : (req.headers.accept.includes("vnd.pgrst.object") && !url.searchParams.has("limit") ? send(res, 406, { code: "PGRST116", message: "0 rows", details: "The result contains 0 rows" }) : send(res, 200, null));
  return send(res, 200, rows, headers);
});
server.listen(PORT, () => console.log(`fake supabase on ${PORT}`));
