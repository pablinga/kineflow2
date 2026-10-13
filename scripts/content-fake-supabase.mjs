// Supabase falso en memoria (PostgREST + Storage mínimos) para probar el
// publicador de contenido de punta a punta sin red. Solo lo que usa el código.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const tables = { content_approval_links: [], content_queue: [] };
const objects = new Map();
const PORT = Number(process.env.FAKE_PORT || 54329);

const DEFAULTS = {
  content_approval_links: () => ({ created_at: new Date().toISOString(), id: randomUUID(), used_at: null }),
  content_queue: () => ({
    approved_at: null, approved_by: null, attempts: 0, campaign: "organico", caption: "", created_at: new Date().toISOString(),
    created_by: "admin", error: null, external_id: null, format: "image", group_id: randomUUID(), hashtags: [], id: randomUUID(),
    image_paths: [], link_url: null, next_attempt_at: null, permalink: null, published_at: null, status: "draft",
    template: null, template_fields: {}, updated_at: new Date().toISOString(),
  }),
};

function parseValue(raw) {
  if (raw === "null") return null;
  return raw;
}

function cmp(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function matchCondition(row, column, op, raw) {
  const value = row[column];
  if (op === "eq") return String(value) === raw;
  if (op === "is") return raw === "null" ? value === null : String(value) === raw;
  if (op === "in") return raw.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, "")).includes(String(value));
  if (op === "lte") return value !== null && cmp(value, raw) <= 0;
  if (op === "lt") return value !== null && cmp(value, raw) < 0;
  if (op === "gte") return value !== null && cmp(value, raw) >= 0;
  if (op === "gt") return value !== null && cmp(value, raw) > 0;
  throw new Error(`op no soportado ${op}`);
}

function applyFilters(rows, params) {
  let result = rows;
  for (const [key, val] of params) {
    if (["select", "order", "limit", "offset", "columns"].includes(key)) continue;
    if (key === "or") {
      const parts = val.replace(/^\(|\)$/g, "").split(",");
      result = result.filter((row) =>
        parts.some((part) => {
          const [column, op, ...rest] = part.split(".");
          return matchCondition(row, column, op, rest.join("."));
        }),
      );
      continue;
    }
    const [op, ...rest] = val.split(".");
    result = result.filter((row) => matchCondition(row, key, op, rest.join(".")));
  }
  return result;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const body = await readBody(req);

  // ---- utilidades de la prueba ----
  if (url.pathname === "/__state") return send(res, 200, tables);
  if (url.pathname === "/__reset") {
    tables.content_queue = [];
    tables.content_approval_links = [];
    return send(res, 200, { ok: true });
  }

  // ---- Storage ----
  const upload = url.pathname.match(/^\/storage\/v1\/object\/social\/(.+)$/);
  if (upload && req.method === "POST") {
    objects.set(upload[1], body);
    return send(res, 200, { Key: `social/${upload[1]}` });
  }
  if (url.pathname === "/storage/v1/object/sign/social" && req.method === "POST") {
    const { paths } = JSON.parse(body.toString());
    return send(res, 200, paths.map((path) => ({
      error: objects.has(path) ? null : "not found",
      path,
      signedURL: objects.has(path) ? `/object/sign/social/${path}?token=fake` : null,
    })));
  }
  const signed = url.pathname.match(/^\/storage\/v1\/object\/sign\/social\/(.+)$/);
  if (signed && req.method === "GET") {
    const file = objects.get(signed[1]);
    if (!file) return send(res, 404, { error: "not found" });
    res.writeHead(200, { "content-type": "image/jpeg" });
    return res.end(file);
  }

  // ---- PostgREST ----
  const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
  if (!table || !tables[table]) return send(res, 404, { message: `sin tabla ${url.pathname}` });
  const params = [...url.searchParams.entries()];
  const single = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const wantsReturn = (req.headers.prefer ?? "").includes("return=representation");
  const finish = (rows) => {
    if (single) {
      if (rows.length === 0) return send(res, 406, { code: "PGRST116", message: "0 rows" });
      return send(res, 200, rows[0]);
    }
    return send(res, 200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
  };

  if (req.method === "GET") {
    let rows = applyFilters(tables[table], params);
    const order = url.searchParams.get("order");
    if (order) {
      const [column, direction] = order.split(".");
      rows = [...rows].sort((a, b) => (direction === "desc" ? -cmp(a[column], b[column]) : cmp(a[column], b[column])));
    }
    const limit = Number(url.searchParams.get("limit") || 0);
    if (limit) rows = rows.slice(0, limit);
    return finish(rows);
  }

  if (req.method === "POST") {
    const payload = JSON.parse(body.toString());
    const inserted = (Array.isArray(payload) ? payload : [payload]).map((row) => ({ ...DEFAULTS[table](), ...row }));
    tables[table].push(...inserted);
    return wantsReturn ? finish(inserted) : send(res, 201, undefined);
  }

  if (req.method === "PATCH") {
    const patch = JSON.parse(body.toString());
    const rows = applyFilters(tables[table], params);
    for (const row of rows) Object.assign(row, patch, { updated_at: new Date().toISOString() });
    return wantsReturn ? finish(rows) : send(res, 204, undefined);
  }

  return send(res, 405, { message: "método no soportado" });
});

server.listen(PORT, () => console.log(`fake supabase en ${PORT}`));
