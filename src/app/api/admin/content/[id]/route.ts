import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/content/guards";
import {
  argentinaLocalToUtc,
  composeCaption,
  isEditableStatus,
  normalizeHashtags,
  validateCaption,
} from "@/lib/content/rules";
import { getContent, getContentDb } from "@/lib/content/server";

export const runtime = "nodejs";

/**
 * Editar texto, hashtags y fecha. Si estaba aprobado vuelve a borrador: lo
 * que se publica es siempre lo que aprobaste.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();

  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  const current = await getContent(id);

  if (!current) {
    return NextResponse.json({ error: "No existe." }, { status: 404 });
  }

  if (!isEditableStatus(current.status)) {
    return NextResponse.json({ error: "Ya se publicó o se está publicando." }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    caption?: unknown;
    hashtags?: unknown;
    scheduledAt?: unknown;
  };
  const caption = typeof body.caption === "string" ? body.caption.trim() : current.caption;
  const hashtags = Array.isArray(body.hashtags)
    ? normalizeHashtags(body.hashtags.filter((tag): tag is string => typeof tag === "string"))
    : current.hashtags;
  let scheduledAt = current.scheduled_at;

  if (typeof body.scheduledAt === "string" && body.scheduledAt) {
    try {
      scheduledAt = argentinaLocalToUtc(body.scheduledAt);
    } catch {
      return NextResponse.json({ error: "Fecha inválida." }, { status: 400 });
    }
  }

  const errors = validateCaption(
    composeCaption({ caption, channel: current.channel, hashtags, linkUrl: current.link_url }),
  );

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  const { error } = await getContentDb()
    .from("content_queue")
    .update({
      caption,
      hashtags,
      scheduled_at: scheduledAt,
      ...(current.status === "approved" ? { approved_at: null, approved_by: null, status: "draft" } : {}),
    })
    .eq("id", id)
    .eq("status", current.status);

  if (error) {
    return NextResponse.json({ error: "No pudimos guardar los cambios." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: current.status === "approved" ? "draft" : current.status });
}
