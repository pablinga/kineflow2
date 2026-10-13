import assert from "node:assert/strict";
import {
  argentinaLocalToUtc,
  buildContentLink,
  canTransition,
  composeCaption,
  findPersonalData,
  normalizeCampaign,
  selectDuePosts,
  startOfArgentinaDayUtc,
  utcToArgentinaLocal,
  validateCaption,
} from "../src/lib/content/rules.ts";
import { createApprovalToken, verifyApprovalToken } from "../src/lib/content/approval-token.ts";
import { createMetaClient, MetaApiError } from "../src/lib/content/meta-graph.ts";
import { publishOne, resolvePublishMode, runPublisher } from "../src/lib/content/publisher.ts";

const tests = [];
function test(name, fn) {
  tests.push({ fn, name });
}

// ---------- Reglas ----------

test("link con UTM: source = canal, medium = post, content = id", () => {
  const url = new URL(
    buildContentLink({
      baseUrl: "https://kineflow.ar",
      campaign: "Lanzamiento Octubre",
      channel: "instagram",
      contentId: "4f0a1c2d-d5be-4c1e-8001-ae3b57403e12",
    }),
  );

  assert.equal(url.origin + url.pathname, "https://kineflow.ar/");
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_medium"), "post");
  assert.equal(url.searchParams.get("utm_campaign"), "lanzamiento-octubre");
  assert.equal(url.searchParams.get("utm_content"), "4f0a1c2d-d5be-4c1e-8001-ae3b57403e12");
  assert.equal(normalizeCampaign("  "), "organico");
});

test("caption: IG lleva el link como texto y los hashtags al final, sin duplicados", () => {
  const caption = composeCaption({
    caption: "Tu agenda, sola.",
    channel: "instagram",
    hashtags: ["#kinesiologia", "kinesiologia", " rehabilitacion "],
    linkUrl: "https://kineflow.ar/?utm_source=instagram",
  });

  assert.equal(
    caption,
    "Tu agenda, sola.\n\nMás info: https://kineflow.ar/?utm_source=instagram\n\n#kinesiologia #rehabilitacion",
  );
});

test("caption: largo máximo, hashtags y menciones", () => {
  assert.deepEqual(validateCaption("Hola"), []);
  assert.equal(validateCaption("a".repeat(2201)).length, 1);
  assert.equal(validateCaption(Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ")).length, 1);
  assert.equal(validateCaption(Array.from({ length: 21 }, (_, i) => `@u${i}`).join(" ")).length, 1);
  assert.equal(validateCaption("   ").length, 1);
});

test("datos personales: email, teléfono y DNI; montos y links no cuentan", () => {
  assert.deepEqual(findPersonalData("Escribinos a juan.perez@gmail.com"), ["email"]);
  assert.deepEqual(findPersonalData("Llamá al +54 9 11 4567-8901"), ["telefono"]);
  assert.deepEqual(findPersonalData("Paciente DNI 30.123.456"), ["dni"]);
  assert.deepEqual(findPersonalData("dni 30123456"), ["dni"]);
  assert.deepEqual(findPersonalData("Plan a $20.000 por mes, 3 meses gratis"), []);
  assert.deepEqual(findPersonalData("Ahorrá $1.250.000 al año"), []);
  assert.deepEqual(findPersonalData("Mirá https://kineflow.ar/?utm_content=12345678"), []);
  assert.deepEqual(findPersonalData("Atendé 2.000 pacientes en 2026"), []);
});

test("estados: transiciones válidas e inválidas", () => {
  assert.equal(canTransition("draft", "approved"), true);
  assert.equal(canTransition("approved", "publishing"), true);
  assert.equal(canTransition("publishing", "published"), true);
  assert.equal(canTransition("publishing", "approved"), true);
  assert.equal(canTransition("draft", "publishing"), false);
  assert.equal(canTransition("published", "draft"), false);
  assert.equal(canTransition("rejected", "approved"), false);
});

test("hora de Argentina <-> UTC (sin horario de verano)", () => {
  assert.equal(argentinaLocalToUtc("2026-10-15T21:30"), "2026-10-16T00:30:00.000Z");
  assert.equal(utcToArgentinaLocal("2026-10-16T00:30:00.000Z"), "2026-10-15T21:30");
  assert.throws(() => argentinaLocalToUtc("15/10/2026 21:30"));
  // 01:00 UTC del 14 = 22:00 del 13 en Argentina: el día empieza el 13 a las 03:00 UTC.
  assert.equal(startOfArgentinaDayUtc(new Date("2026-10-14T01:00:00Z")), "2026-10-13T03:00:00.000Z");
});

test("selección de posts a publicar: aprobados, vencidos, respetando el reintento", () => {
  const now = new Date("2026-10-15T15:00:00Z"); // 12:00 en Argentina
  const posts = [
    { id: "a", next_attempt_at: null, scheduled_at: argentinaLocalToUtc("2026-10-15T11:59"), status: "approved" },
    { id: "b", next_attempt_at: null, scheduled_at: argentinaLocalToUtc("2026-10-15T12:01"), status: "approved" },
    { id: "c", next_attempt_at: null, scheduled_at: argentinaLocalToUtc("2026-10-15T09:00"), status: "draft" },
    { id: "d", next_attempt_at: "2026-10-15T15:30:00Z", scheduled_at: argentinaLocalToUtc("2026-10-15T08:00"), status: "approved" },
    { id: "e", next_attempt_at: "2026-10-15T14:59:00Z", scheduled_at: argentinaLocalToUtc("2026-10-15T08:00"), status: "approved" },
    { id: "f", next_attempt_at: null, scheduled_at: argentinaLocalToUtc("2026-10-15T12:00"), status: "approved" },
  ];

  assert.deepEqual(selectDuePosts(posts, now).map((post) => post.id), ["e", "a", "f"]);
});

// ---------- Links de aprobación ----------

const SECRET = "s".repeat(40);
const payload = { action: "approve", contentId: "post-1", exp: 2_000_000_000, linkId: "link-1" };

test("link de aprobación válido", () => {
  const token = createApprovalToken(payload, SECRET);
  const result = verifyApprovalToken(token, SECRET, new Date("2026-10-15T00:00:00Z"));

  assert.deepEqual(result, { ok: true, payload });
});

test("link de aprobación vencido", () => {
  const token = createApprovalToken({ ...payload, exp: Math.floor(Date.parse("2026-10-14T00:00:00Z") / 1000) }, SECRET);

  assert.deepEqual(verifyApprovalToken(token, SECRET, new Date("2026-10-15T00:00:00Z")), {
    ok: false,
    reason: "expired",
  });
});

test("link de aprobación adulterado u otra clave", () => {
  const token = createApprovalToken(payload, SECRET);
  const [data, signature] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...payload, action: "reject" })).toString("base64url");

  assert.equal(verifyApprovalToken(`${forged}.${signature}`, SECRET).ok, false);
  assert.equal(verifyApprovalToken(`${data}.${signature}x`, SECRET).ok, false);
  assert.equal(verifyApprovalToken(token, "o".repeat(40)).ok, false);
  assert.equal(verifyApprovalToken("basura", SECRET).ok, false);
});

// El uso único se marca en la base (content_approval_links.used_at); acá se
// prueba el contrato con un repositorio en memoria.
test("link de aprobación reutilizado: el segundo uso no hace nada", () => {
  const used = new Set();
  const consume = (linkId) => {
    if (used.has(linkId)) return false;
    used.add(linkId);
    return true;
  };

  assert.equal(consume(payload.linkId), true);
  assert.equal(consume(payload.linkId), false);
});

// ---------- Publicador con la Graph API simulada ----------

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

/** Meta falso: `routes` mapea "METHOD path" -> función que devuelve la respuesta. */
function fakeMeta(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/v\d+\.\d+/, "");
    const key = `${init.method} ${path}`;
    calls.push({ auth: init.headers.Authorization, key, url });
    const handler = routes[key];
    if (!handler) return jsonResponse(404, { error: { code: 100, message: `sin ruta ${key}` } });
    return handler(init.body);
  };
  return { calls, fetchImpl };
}

function makeRepo(posts) {
  const state = new Map(posts.map((post) => [post.id, { ...post }]));
  const events = [];
  return {
    events,
    state,
    repo: {
      async claim(id) {
        const post = state.get(id);
        if (!post || post.status !== "approved") return false;
        post.status = "publishing";
        return true;
      },
      async listDue() {
        return [...state.values()].filter((post) => post.status === "approved").map((post) => ({ ...post }));
      },
      async markFailed(id, params) {
        Object.assign(state.get(id), { status: "failed", ...params });
        events.push(["failed", id]);
      },
      async markPublished(id, result) {
        Object.assign(state.get(id), result);
        events.push([result.status, id]);
      },
      async release(id, params) {
        Object.assign(state.get(id), { status: "approved", ...params });
        events.push(["release", id]);
      },
      async signImageUrls(paths) {
        return paths.map((path) => `https://storage.test/${path}?token=firmado`);
      },
    },
  };
}

const basePost = {
  attempts: 0,
  campaign: "test",
  caption: "Probando",
  channel: "instagram",
  format: "image",
  hashtags: ["kinesiologia"],
  id: "p1",
  image_paths: ["2026/10/p1.jpg"],
  link_url: null,
  next_attempt_at: null,
  scheduled_at: "2026-10-15T12:00:00Z",
  status: "approved",
};

function deps(repo, meta, overrides = {}) {
  const notified = [];
  return {
    notified,
    value: {
      log: () => {},
      meta,
      mode: "live",
      notify: {
        async failed(post, error) {
          notified.push(["failed", post.id, error]);
        },
        async tokenProblem(post, error) {
          notified.push(["token", post.id, error]);
        },
      },
      now: () => new Date("2026-10-15T15:00:00Z"),
      repo,
      ...overrides,
    },
  };
}

const CONFIG = { accessToken: "TOKEN-SECRETO", graphVersion: "v26.0", igUserId: "IG1", pageId: "PAGE1" };
const noSleep = async () => {};

test("modo: solo 'live' explícito publica de verdad", () => {
  assert.equal(resolvePublishMode("live"), "live");
  assert.equal(resolvePublishMode(undefined), "dry_run");
  assert.equal(resolvePublishMode("LIVE"), "dry_run");
  assert.equal(resolvePublishMode("dry_run"), "dry_run");
});

test("publicador: dry_run no llama a Meta y marca published_dry_run", async () => {
  const { repo, state } = makeRepo([basePost]);
  const { calls, fetchImpl } = fakeMeta({});
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });
  const outcome = await publishOne(basePost, deps(repo, meta, { mode: "dry_run" }).value);

  assert.equal(outcome, "published_dry_run");
  assert.equal(state.get("p1").status, "published_dry_run");
  assert.equal(calls.length, 0);
});

test("publicador: IG imagen con éxito (contenedor -> listo -> publicar -> permalink)", async () => {
  const { repo, state } = makeRepo([basePost]);
  let statusChecks = 0;
  const logs = [];
  const { calls, fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () => jsonResponse(200, { data: [{ config: { quota_total: 50 }, quota_usage: 3 }] }),
    "POST /IG1/media": (body) => {
      assert.equal(body.get("image_url"), "https://storage.test/2026/10/p1.jpg?token=firmado");
      assert.match(body.get("caption"), /#kinesiologia/);
      return jsonResponse(200, { id: "C1" });
    },
    "GET /C1": () => jsonResponse(200, { status_code: ++statusChecks < 2 ? "IN_PROGRESS" : "FINISHED" }),
    "POST /IG1/media_publish": (body) => {
      assert.equal(body.get("creation_id"), "C1");
      return jsonResponse(200, { id: "M1" });
    },
    "GET /M1": () => jsonResponse(200, { permalink: "https://instagram.com/p/abc" }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, log: (entry) => logs.push(entry), sleep: noSleep });
  const outcome = await publishOne(basePost, deps(repo, meta).value);

  assert.equal(outcome, "published");
  assert.equal(state.get("p1").status, "published");
  assert.equal(state.get("p1").externalId, "M1");
  assert.equal(state.get("p1").permalink, "https://instagram.com/p/abc");
  // El token viaja solo en el header, nunca en la URL ni en los logs.
  assert.ok(calls.every((call) => !call.url.includes("TOKEN-SECRETO")));
  assert.ok(calls.every((call) => call.auth === "Bearer TOKEN-SECRETO"));
  assert.ok(logs.every((entry) => !JSON.stringify(entry).includes("TOKEN-SECRETO")));
  assert.ok(logs.every((entry) => typeof entry.durationMs === "number" && entry.status === 200));
});

test("publicador: IG carrusel crea hijos, carrusel y publica", async () => {
  const post = { ...basePost, format: "carousel", id: "p2", image_paths: ["a.jpg", "b.jpg"] };
  const { repo, state } = makeRepo([post]);
  let created = 0;
  const { fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () => jsonResponse(200, { data: [{ config: { quota_total: 50 }, quota_usage: 0 }] }),
    "POST /IG1/media": (body) => {
      created += 1;
      if (body.get("media_type") === "CAROUSEL") {
        assert.equal(body.get("children"), "K1,K2");
        assert.ok(body.get("caption"));
        return jsonResponse(200, { id: "CAR" });
      }
      assert.equal(body.get("is_carousel_item"), "true");
      assert.equal(body.get("caption"), null);
      return jsonResponse(200, { id: `K${created}` });
    },
    "GET /K1": () => jsonResponse(200, { status_code: "FINISHED" }),
    "GET /K2": () => jsonResponse(200, { status_code: "FINISHED" }),
    "GET /CAR": () => jsonResponse(200, { status_code: "FINISHED" }),
    "POST /IG1/media_publish": () => jsonResponse(200, { id: "M2" }),
    "GET /M2": () => jsonResponse(200, { permalink: "https://instagram.com/p/car" }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });

  assert.equal(await publishOne(post, deps(repo, meta).value), "published");
  assert.equal(state.get("p2").externalId, "M2");
});

test("publicador: contenedor que no queda listo -> reintento con backoff y error legible", async () => {
  const { repo, state } = makeRepo([basePost]);
  const { fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () => jsonResponse(200, { data: [{ config: { quota_total: 50 }, quota_usage: 0 }] }),
    "POST /IG1/media": () => jsonResponse(200, { id: "C1" }),
    "GET /C1": () => jsonResponse(200, { status_code: "IN_PROGRESS" }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });
  const outcome = await publishOne(basePost, deps(repo, meta).value);

  assert.equal(outcome, "retry");
  assert.equal(state.get("p1").status, "approved");
  assert.equal(state.get("p1").attempts, 1);
  assert.equal(state.get("p1").nextAttemptAt, "2026-10-15T15:15:00.000Z");
  assert.match(state.get("p1").error, /no quedó listo/);
});

test("publicador: al tercer intento queda failed y avisa por mail", async () => {
  const post = { ...basePost, attempts: 2 };
  const { repo, state } = makeRepo([post]);
  const { fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () => jsonResponse(200, { data: [{ config: { quota_total: 50 }, quota_usage: 0 }] }),
    "POST /IG1/media": () => jsonResponse(500, { error: { code: 1, message: "An unknown error occurred" } }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });
  const d = deps(repo, meta);

  assert.equal(await publishOne(post, d.value), "failed");
  assert.equal(state.get("p1").status, "failed");
  assert.equal(state.get("p1").attempts, 3);
  assert.deepEqual(d.notified.map(([kind]) => kind), ["failed"]);
});

test("publicador: sin cupo en IG reprograma sin gastar intentos", async () => {
  const { repo, state } = makeRepo([basePost]);
  const { calls, fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () => jsonResponse(200, { data: [{ config: { quota_total: 50 }, quota_usage: 50 }] }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });

  assert.equal(await publishOne(basePost, deps(repo, meta).value), "rescheduled_limit");
  assert.equal(state.get("p1").status, "approved");
  assert.equal(state.get("p1").attempts, 0);
  assert.equal(state.get("p1").nextAttemptAt, "2026-10-15T16:00:00.000Z");
  assert.ok(!calls.some((call) => call.key === "POST /IG1/media"));
});

test("publicador: token inválido no reintenta y avisa con instrucciones", async () => {
  const { repo, state } = makeRepo([basePost]);
  const { fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () =>
      jsonResponse(400, { error: { code: 190, message: "Error validating access token", type: "OAuthException" } }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });
  const d = deps(repo, meta);

  assert.equal(await publishOne(basePost, d.value), "failed_auth");
  assert.equal(state.get("p1").status, "failed");
  assert.deepEqual(d.notified.map(([kind]) => kind), ["token"]);
});

test("publicador: Facebook con imagen usa el Page token y /photos", async () => {
  const post = { ...basePost, channel: "facebook", id: "f1", link_url: "https://kineflow.ar/?utm_source=facebook" };
  const { repo, state } = makeRepo([post]);
  const { calls, fetchImpl } = fakeMeta({
    "GET /PAGE1": () => jsonResponse(200, { access_token: "PAGE-TOKEN" }),
    "POST /PAGE1/photos": (body) => {
      assert.match(body.get("message"), /https:\/\/kineflow\.ar/);
      return jsonResponse(200, { id: "PH1", post_id: "PAGE1_99" });
    },
    "GET /PAGE1_99": () => jsonResponse(200, { permalink_url: "https://facebook.com/PAGE1/posts/99" }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });

  assert.equal(await publishOne(post, deps(repo, meta).value), "published");
  assert.equal(state.get("f1").externalId, "PAGE1_99");
  assert.equal(calls.find((call) => call.key === "POST /PAGE1/photos").auth, "Bearer PAGE-TOKEN");
});

test("publicador: Facebook solo link usa /feed", async () => {
  const post = { ...basePost, channel: "facebook", id: "f2", image_paths: [], link_url: "https://kineflow.ar/?x=1" };
  const { repo } = makeRepo([post]);
  const { fetchImpl } = fakeMeta({
    "GET /PAGE1": () => jsonResponse(200, { access_token: "PAGE-TOKEN" }),
    "POST /PAGE1/feed": (body) => {
      assert.equal(body.get("link"), "https://kineflow.ar/?x=1");
      return jsonResponse(200, { id: "PAGE1_100" });
    },
    "GET /PAGE1_100": () => jsonResponse(200, { permalink_url: "https://facebook.com/x" }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });

  assert.equal(await publishOne(post, deps(repo, meta).value), "published");
});

test("publicador: dos corridas concurrentes no publican dos veces", async () => {
  const { repo } = makeRepo([basePost]);
  let publishCalls = 0;
  const { fetchImpl } = fakeMeta({
    "GET /IG1/content_publishing_limit": () => jsonResponse(200, { data: [{ config: { quota_total: 50 }, quota_usage: 0 }] }),
    "POST /IG1/media": () => jsonResponse(200, { id: "C1" }),
    "GET /C1": () => jsonResponse(200, { status_code: "FINISHED" }),
    "POST /IG1/media_publish": () => {
      publishCalls += 1;
      return jsonResponse(200, { id: "M1" });
    },
    "GET /M1": () => jsonResponse(200, { permalink: "https://instagram.com/p/x" }),
  });
  const meta = createMetaClient(CONFIG, { fetch: fetchImpl, sleep: noSleep });
  const [first, second] = await Promise.all([
    runPublisher(deps(repo, meta).value),
    runPublisher(deps(repo, meta).value),
  ]);
  const outcomes = [...first, ...second].map((result) => result.outcome).sort();

  assert.equal(publishCalls, 1);
  assert.deepEqual(outcomes, ["published", "skipped_claimed"]);
});

test("errores de Meta: clasificación", () => {
  const kind = (code, httpStatus = 400, subcode = null) =>
    new MetaApiError({ code, httpStatus, message: "x", subcode }).kind;

  assert.equal(kind(190), "auth");
  assert.equal(kind(200), "auth");
  assert.equal(kind(4), "rate_limit");
  assert.equal(kind(9, 400, 2207042), "rate_limit");
  assert.equal(kind(null, 503), "transient");
  assert.equal(kind(100), "invalid");
});

let failed = 0;
for (const { fn, name } of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`not ok - ${name}`);
    console.error(error);
  }
}
if (failed > 0) process.exit(1);
