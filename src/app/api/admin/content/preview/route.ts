import { NextResponse } from "next/server";
import { CONTENT_SIZES, CONTENT_TEMPLATES, renderTemplateJpeg } from "@/lib/content/render";
import type { ContentSize, ContentTemplate, TemplateFields } from "@/lib/content/render";
import { requireAdminApi } from "@/lib/content/guards";

export const runtime = "nodejs";

/** Vista previa de una plantilla (no sube nada). */
export async function POST(request: Request) {
  const denied = await requireAdminApi();

  if (denied) {
    return denied;
  }

  const body = (await request.json().catch(() => ({}))) as {
    fields?: TemplateFields;
    size?: ContentSize;
    template?: ContentTemplate;
  };

  if (!body.template || !CONTENT_TEMPLATES.includes(body.template) || !body.fields?.title?.trim()) {
    return NextResponse.json({ error: "Elegí una plantilla y escribí un título." }, { status: 400 });
  }

  const size = body.size && body.size in CONTENT_SIZES ? body.size : "feed";
  const jpeg = await renderTemplateJpeg(body.template, {
    number: body.fields.number?.slice(0, 3),
    screenshot: body.fields.screenshot ?? null,
    subtitle: body.fields.subtitle?.slice(0, 160),
    title: body.fields.title.slice(0, 90),
  }, size);

  return new NextResponse(new Uint8Array(jpeg), {
    headers: { "Cache-Control": "no-store", "Content-Type": "image/jpeg" },
  });
}
