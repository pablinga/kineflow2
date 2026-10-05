// Atribución de adquisición contra un ambiente real (QA). Crea usuarios y
// eventos temporales y los borra al final.
//
// Uso:
//   set -a; source .env.qa.local; set +a
//   npm run test:attribution:qa
// Con la app corriendo (dev server o deploy), también prueba la API de eventos:
//   APP_URL=http://localhost:3000 npm run test:attribution:qa
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL;

if (!url || !anonKey || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const runId = Date.now().toString(36);
const password = `QA-attr-${runId}-x`;
const userIds = [];
const visitorIds = [];
let failures = 0;

function check(name, condition, detail = "") {
  if (!condition) {
    failures += 1;
  }

  console.log(`${condition ? "ok" : "FAIL"} - ${name}${detail ? ` (${detail})` : ""}`);
}

async function createUser(tag, attribution) {
  const email = `attr-${tag}-${runId}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
    user_metadata: {
      account_type: "KINESIOLOGO",
      full_name: `Attr ${tag}`,
      license_number: `ATTR-${runId}-${tag}`,
      role: "kinesiologist",
      ...(attribution === undefined ? {} : { attribution }),
    },
  });

  if (error || !data.user) {
    throw new Error(`No se pudo crear ${tag}: ${error?.message}`);
  }

  userIds.push(data.user.id);
  return { email, id: data.user.id };
}

async function signIn(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message);
  }

  return client;
}

async function attributionOf(userId) {
  const { data } = await admin
    .from("user_attribution")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

try {
  const visitorId = crypto.randomUUID();
  visitorIds.push(visitorId);
  const campaign = `test_attr_${runId}`;

  // 1. Registro con atribución: queda asociada al usuario.
  const withUtm = await createUser("utm", {
    first_visited_at: "2026-10-04T12:00:00.000Z",
    landing_page: "/?utm_source=email",
    referrer: "https://mail.google.com",
    utm_campaign: campaign,
    utm_content: "Clinica_ABC",
    utm_medium: "outreach",
    utm_source: "email",
    visitor_id: visitorId,
  });
  const row = await attributionOf(withUtm.id);
  check("signup conserva la atribución", row?.utm_source === "email" && row?.utm_campaign === campaign);
  check("utm_content se guarda (slug en minúsculas)", row?.utm_content === "clinica_abc", row?.utm_content);
  check("landing sin query", row?.landing_page === "/", row?.landing_page);
  check("visitor_id asociado (une eventos y registro)", row?.visitor_id === visitorId);
  check("first_visited_at guardado", row?.first_visited_at?.startsWith("2026-10-04"));

  // 2. Sin UTM: registro normal, sin fila de atribución.
  const plain = await createUser("plain");
  check("usuario sin UTM se registra normalmente", Boolean(plain.id));
  check("usuario sin UTM no tiene atribución", (await attributionOf(plain.id)) === null);

  // 3. Datos malformados: el registro no se rompe y se descarta lo inválido.
  const malformed = await createUser("bad", {
    first_visited_at: "no-es-fecha",
    landing_page: "https://otro.com",
    referrer: "javascript:alert(1)",
    utm_content: "juan@clinica.com",
    utm_source: "email",
    visitor_id: "no-es-uuid",
  });
  const badRow = await attributionOf(malformed.id);
  check("atribución malformada no rompe el registro", Boolean(malformed.id));
  check(
    "campos inválidos se descartan (email en utm_content, fecha, uuid, referrer)",
    badRow?.utm_source === "email" &&
      badRow.utm_content === null &&
      badRow.first_visited_at === null &&
      badRow.visitor_id === null &&
      badRow.referrer === null &&
      badRow.landing_page === null,
    JSON.stringify(badRow),
  );
  const garbage = await createUser("garbage", "no es un objeto");
  check("metadata attribution con tipo inválido no rompe el registro", Boolean(garbage.id));
  check("y no genera fila", (await attributionOf(garbage.id)) === null);

  // 4. RLS.
  const clientA = await signIn(withUtm.email);
  const clientB = await signIn(plain.email);
  const own = await clientA.from("user_attribution").select("user_id");
  check("el usuario lee solo su atribución", own.data?.length === 1 && own.data[0].user_id === withUtm.id);
  const other = await clientB.from("user_attribution").select("user_id").eq("user_id", withUtm.id);
  check("otro usuario no ve la atribución ajena", (other.data ?? []).length === 0);
  const insert = await clientB.from("user_attribution").insert({ user_id: plain.id, utm_source: "x" });
  check("nadie inserta atribución desde el cliente", Boolean(insert.error), insert.error?.code);
  const update = await clientA.from("user_attribution").update({ utm_campaign: "hack" }).eq("user_id", withUtm.id).select("id");
  check("nadie modifica atribución desde el cliente", Boolean(update.error) || (update.data ?? []).length === 0);
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const anonRead = await anon.from("user_attribution").select("id").limit(1);
  check("anónimo no lee atribuciones", Boolean(anonRead.error) || (anonRead.data ?? []).length === 0);
  const events = await clientA.from("acquisition_events").select("id").limit(1);
  check("usuarios no leen acquisition_events", Boolean(events.error) || (events.data ?? []).length === 0);
  const contacts = await clientA.from("outreach_contacts").select("id").limit(1);
  check("usuarios no leen outreach_contacts", Boolean(contacts.error) || (contacts.data ?? []).length === 0);

  // 5. API de eventos (solo con la app corriendo).
  if (appUrl) {
    const body = {
      attribution: {
        first_visited_at: "2026-10-04T12:00:00.000Z",
        landing_page: "/",
        referrer: null,
        utm_campaign: campaign,
        utm_content: "clinica_abc",
        utm_medium: "outreach",
        utm_source: "email",
        utm_term: null,
      },
      eventType: "landing_view",
      visitorId,
    };
    const post = (payload) =>
      fetch(`${appUrl}/api/acquisition/event`, {
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
    const first = await post(body);
    await post(body);
    await post({ ...body, eventType: "signup_started" });
    const { data: rows } = await admin
      .from("acquisition_events")
      .select("event_type")
      .eq("visitor_id", visitorId);
    check("API: evento válido se guarda", first.status === 200);
    check(
      "API: un evento por visitante y tipo (sin duplicados)",
      rows?.filter((item) => item.event_type === "landing_view").length === 1 &&
        rows?.filter((item) => item.event_type === "signup_started").length === 1,
      JSON.stringify(rows),
    );
    const invalid = await post({ ...body, eventType: "signup_completed" });
    const noUtm = await post({ ...body, attribution: { utm_source: "a@b.com" } });
    const broken = await fetch(`${appUrl}/api/acquisition/event`, { body: "{no json", method: "POST" });
    check("API: rechaza tipo inválido, atribución inválida y JSON roto", invalid.status === 400 && noUtm.status === 400 && broken.status === 400);
  } else {
    console.log("skip - API de eventos (definí APP_URL para probarla)");
  }
} catch (error) {
  failures += 1;
  console.error("ERROR", error instanceof Error ? error.message : error);
} finally {
  if (visitorIds.length) {
    await admin.from("acquisition_events").delete().in("visitor_id", visitorIds);
  }

  if (userIds.length) {
    const { data: workspaces } = await admin.from("workspaces").select("id").in("owner_id", userIds);
    const workspaceIds = (workspaces ?? []).map((workspace) => workspace.id);

    if (workspaceIds.length) {
      await admin.from("workspace_members").delete().in("workspace_id", workspaceIds);
      await admin.from("workspaces").delete().in("id", workspaceIds);
    }

    for (const id of userIds) {
      const { error } = await admin.auth.admin.deleteUser(id);

      if (error) {
        console.error("deleteUser", id, error.message);
      }
    }

    const { count } = await admin
      .from("user_attribution")
      .select("id", { count: "exact", head: true })
      .in("user_id", userIds);
    check("cleanup: atribuciones borradas en cascada con el usuario", count === 0, String(count));
  }
}

if (failures > 0) {
  console.error(`\n${failures} verificaciones fallaron.`);
  process.exit(1);
}

console.log("\nok - attribution-check: registro, saneamiento, RLS y eventos cubiertos.");
