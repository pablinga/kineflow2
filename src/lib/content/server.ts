import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { createApprovalToken, verifyApprovalToken, type ApprovalAction } from "./approval-token.ts";
import { createMetaClient, type MetaCallLog } from "./meta-graph.ts";
import type { PublisherRepo, QueuedPost } from "./publisher.ts";
import { resolvePublishMode } from "./publisher.ts";
import { APPROVAL_LINK_TTL_HOURS, canTransition, type ContentStatus } from "./rules.ts";

// Acceso a datos del publicador. Todo con el service role: las tablas tienen
// RLS sin policies (solo el servidor las toca).

export const SOCIAL_BUCKET = "social";

export type ContentRow = QueuedPost & {
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  created_by: string;
  error: string | null;
  external_id: string | null;
  group_id: string;
  permalink: string | null;
  published_at: string | null;
  template: string | null;
  template_fields: Record<string, unknown>;
  updated_at: string;
};

export function getAppBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://kineflow.ar").replace(/\/$/, "");
}

export function getContentDb(): SupabaseClient {
  const client = getSupabaseAdminClient();

  if (!client) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY.");
  }

  return client;
}

/** Configuración de Meta, o null si falta algo (en ese caso solo dry_run). */
export function getMetaConfig() {
  const accessToken = process.env.META_ACCESS_TOKEN?.trim();
  const igUserId = process.env.META_IG_USER_ID?.trim();
  const pageId = process.env.META_PAGE_ID?.trim();
  const graphVersion = process.env.META_GRAPH_VERSION?.trim() || "v26.0";

  if (!accessToken || !igUserId || !pageId) {
    return null;
  }

  return { accessToken, graphVersion, igUserId, pageId };
}

export function getPublishMode() {
  return resolvePublishMode(process.env.META_PUBLISH_MODE);
}

export function createLiveMetaClient() {
  const config = getMetaConfig();

  if (!config) {
    return null;
  }

  return createMetaClient(config, {
    fetch,
    // Sin token ni parámetros: solo endpoint, status y duración.
    log: (entry: MetaCallLog) => console.info("[meta]", entry),
  });
}

export async function signImageUrls(paths: string[], expiresInSeconds: number) {
  if (paths.length === 0) {
    return [];
  }

  const { data, error } = await getContentDb()
    .storage.from(SOCIAL_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) {
    throw new Error(`No pudimos firmar las imágenes: ${error?.message ?? "sin datos"}`);
  }

  return data.map((item) => {
    if (!item.signedUrl) {
      throw new Error(`No existe la imagen ${item.path}.`);
    }

    return item.signedUrl;
  });
}

export async function uploadContentImage(jpeg: Buffer) {
  const now = new Date();
  const imagePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.jpg`;
  const { error } = await getContentDb()
    .storage.from(SOCIAL_BUCKET)
    .upload(imagePath, jpeg, { contentType: "image/jpeg", upsert: false });

  if (error) {
    throw new Error(`No pudimos subir la imagen: ${error.message}`);
  }

  return imagePath;
}

const ROW_COLUMNS =
  "id, group_id, channel, format, template, template_fields, caption, hashtags, image_paths, link_url, campaign, scheduled_at, status, approved_at, approved_by, published_at, external_id, permalink, error, attempts, next_attempt_at, created_by, created_at, updated_at";

export async function getContent(id: string) {
  const { data, error } = await getContentDb()
    .from("content_queue")
    .select(ROW_COLUMNS)
    .eq("id", id)
    .maybeSingle<ContentRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function listContent(limit = 200) {
  const { data, error } = await getContentDb()
    .from("content_queue")
    .select(ROW_COLUMNS)
    .order("scheduled_at", { ascending: false })
    .limit(limit)
    .returns<ContentRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

/**
 * Cambio de estado condicional: solo si el estado actual es `from` (así dos
 * acciones simultáneas no se pisan). Devuelve la fila o null.
 */
export async function transitionContent(
  id: string,
  from: ContentStatus[],
  to: ContentStatus,
  extra: Record<string, unknown> = {},
) {
  // Mismo estado = solo actualizar campos (ej. fecha de un aprobado).
  if (!from.every((status) => status === to || canTransition(status, to))) {
    throw new Error(`Transición inválida hacia ${to}.`);
  }

  const { data, error } = await getContentDb()
    .from("content_queue")
    .update({ ...extra, status: to })
    .eq("id", id)
    .in("status", from)
    .select(ROW_COLUMNS)
    .maybeSingle<ContentRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export function createPublisherRepo(): PublisherRepo {
  const db = getContentDb();

  return {
    async claim(id) {
      const { data, error } = await db
        .from("content_queue")
        .update({ status: "publishing" })
        .eq("id", id)
        .eq("status", "approved")
        .select("id");

      if (error) {
        throw new Error(error.message);
      }

      return (data?.length ?? 0) === 1;
    },
    async listDue(now) {
      const nowIso = now.toISOString();
      const { data, error } = await db
        .from("content_queue")
        .select(ROW_COLUMNS)
        .eq("status", "approved")
        .lte("scheduled_at", nowIso)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .order("scheduled_at", { ascending: true })
        .limit(20)
        .returns<ContentRow[]>();

      if (error) {
        throw new Error(error.message);
      }

      return data ?? [];
    },
    async markFailed(id, params) {
      const { error } = await db
        .from("content_queue")
        .update({ attempts: params.attempts, error: params.error, status: "failed" })
        .eq("id", id)
        .eq("status", "publishing");

      if (error) throw new Error(error.message);
    },
    async markPublished(id, result) {
      const { error } = await db
        .from("content_queue")
        .update({
          error: null,
          external_id: result.externalId,
          permalink: result.permalink,
          published_at: new Date().toISOString(),
          status: result.status,
        })
        .eq("id", id)
        .eq("status", "publishing");

      if (error) throw new Error(error.message);
    },
    async release(id, params) {
      const { error } = await db
        .from("content_queue")
        .update({
          attempts: params.attempts,
          error: params.error,
          next_attempt_at: params.nextAttemptAt,
          status: "approved",
        })
        .eq("id", id)
        .eq("status", "publishing");

      if (error) throw new Error(error.message);
    },
    // Meta descarga la imagen al crear el contenedor: alcanza con 1 hora.
    signImageUrls: (paths) => signImageUrls(paths, 60 * 60),
  };
}

// ---------- Links de aprobación por mail ----------

function getApprovalSecret() {
  const secret = process.env.CONTENT_APPROVAL_SECRET?.trim() ?? "";

  if (secret.length < 32) {
    throw new Error("Falta CONTENT_APPROVAL_SECRET (mínimo 32 caracteres).");
  }

  return secret;
}

/** Crea los links Aprobar / Rechazar (72 h, un solo uso) de un borrador. */
export async function createApprovalLinks(contentId: string) {
  const secret = getApprovalSecret();
  const expiresAt = new Date(Date.now() + APPROVAL_LINK_TTL_HOURS * 60 * 60 * 1000);
  const actions: ApprovalAction[] = ["approve", "reject"];
  const { data, error } = await getContentDb()
    .from("content_approval_links")
    .insert(actions.map((action) => ({ action, content_id: contentId, expires_at: expiresAt.toISOString() })))
    .select("id, action")
    .returns<Array<{ action: ApprovalAction; id: string }>>();

  if (error || !data) {
    throw new Error(error?.message ?? "No pudimos crear los links de aprobación.");
  }

  const base = getAppBaseUrl();
  const links = {} as Record<ApprovalAction, string>;

  for (const row of data) {
    const token = createApprovalToken(
      { action: row.action, contentId, exp: Math.floor(expiresAt.getTime() / 1000), linkId: row.id },
      secret,
    );
    links[row.action] = `${base}/contenido/aprobacion?t=${encodeURIComponent(token)}`;
  }

  return links;
}

export type ApprovalCheck =
  | { ok: true; action: ApprovalAction; content: ContentRow; linkId: string }
  | { ok: false; reason: "invalid" | "expired" | "used" | "not_draft" };

/** Valida el token sin consumirlo (para la página de confirmación del GET). */
export async function checkApprovalToken(token: string): Promise<ApprovalCheck> {
  const verified = verifyApprovalToken(token, getApprovalSecret());

  if (!verified.ok) {
    return { ok: false, reason: verified.reason };
  }

  const { data: link } = await getContentDb()
    .from("content_approval_links")
    .select("id, used_at, expires_at, content_id, action")
    .eq("id", verified.payload.linkId)
    .maybeSingle<{ action: string; content_id: string; expires_at: string; id: string; used_at: string | null }>();

  if (!link || link.content_id !== verified.payload.contentId || link.action !== verified.payload.action) {
    return { ok: false, reason: "invalid" };
  }

  if (link.used_at) {
    return { ok: false, reason: "used" };
  }

  const content = await getContent(link.content_id);

  if (!content) {
    return { ok: false, reason: "invalid" };
  }

  if (content.status !== "draft") {
    return { ok: false, reason: "not_draft" };
  }

  return { action: verified.payload.action, content, linkId: link.id, ok: true };
}

/** Ejecuta la acción del link (POST). Marca de uso atómica: un solo uso. */
export async function consumeApprovalToken(token: string) {
  const check = await checkApprovalToken(token);

  if (!check.ok) {
    return check;
  }

  const db = getContentDb();
  const { data: used, error } = await db
    .from("content_approval_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", check.linkId)
    .is("used_at", null)
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  if ((used?.length ?? 0) !== 1) {
    return { ok: false as const, reason: "used" as const };
  }

  // El otro link del mismo borrador también queda usado.
  await db
    .from("content_approval_links")
    .update({ used_at: new Date().toISOString() })
    .eq("content_id", check.content.id)
    .is("used_at", null);

  const updated =
    check.action === "approve"
      ? await transitionContent(check.content.id, ["draft"], "approved", {
          approved_at: new Date().toISOString(),
          approved_by: "mail",
        })
      : await transitionContent(check.content.id, ["draft"], "rejected");

  if (!updated) {
    return { ok: false as const, reason: "not_draft" as const };
  }

  return { action: check.action, content: updated, ok: true as const };
}
