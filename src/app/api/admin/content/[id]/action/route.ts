import { NextResponse } from "next/server";
import { duplicateForOtherChannel } from "@/lib/content/drafts";
import { requireAdminApi } from "@/lib/content/guards";
import { publishOne } from "@/lib/content/publisher";
import { buildPublisherDeps } from "@/lib/content/run";
import { getContent, transitionContent } from "@/lib/content/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Action = "approve" | "reject" | "to_draft" | "duplicate" | "publish_now";

const ACTIONS: Action[] = ["approve", "reject", "to_draft", "duplicate", "publish_now"];

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminApi();

  if (denied) {
    return denied;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { action?: Action };

  if (!body.action || !ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  }

  const current = await getContent(id);

  if (!current) {
    return NextResponse.json({ error: "No existe." }, { status: 404 });
  }

  const approvedFields = {
    approved_at: new Date().toISOString(),
    approved_by: "panel",
    attempts: 0,
    error: null,
    next_attempt_at: null,
  };

  try {
    if (body.action === "duplicate") {
      const copy = await duplicateForOtherChannel(current);
      return NextResponse.json({ id: copy.id, ok: true });
    }

    if (body.action === "approve") {
      const row = await transitionContent(id, ["draft", "failed"], "approved", approvedFields);
      return row
        ? NextResponse.json({ ok: true, status: row.status })
        : NextResponse.json({ error: "Solo se aprueba un borrador o un post fallido." }, { status: 409 });
    }

    if (body.action === "reject") {
      const row = await transitionContent(id, ["draft", "approved"], "rejected");
      return row
        ? NextResponse.json({ ok: true, status: row.status })
        : NextResponse.json({ error: "No se puede rechazar en este estado." }, { status: 409 });
    }

    if (body.action === "to_draft") {
      const row = await transitionContent(id, ["rejected", "failed", "approved"], "draft", {
        approved_at: null,
        approved_by: null,
      });
      return row
        ? NextResponse.json({ ok: true, status: row.status })
        : NextResponse.json({ error: "No se puede volver a borrador en este estado." }, { status: 409 });
    }

    // Publicar ahora = aprobar con fecha de ahora y correr el publicador para
    // este post (respeta dry_run en QA y el update condicional anti-doble).
    const now = new Date().toISOString();
    const approved =
      current.status === "approved"
        ? await transitionContent(id, ["approved"], "approved", { ...approvedFields, scheduled_at: now })
        : await transitionContent(id, ["draft", "failed"], "approved", { ...approvedFields, scheduled_at: now });

    if (!approved) {
      return NextResponse.json({ error: "No se puede publicar en este estado." }, { status: 409 });
    }

    const outcome = await publishOne(approved, buildPublisherDeps());
    const after = await getContent(id);

    return NextResponse.json({ ok: true, outcome, status: after?.status, error: after?.error ?? null });
  } catch (error) {
    console.error("[content] acción", body.action, error);
    return NextResponse.json({ error: "No pudimos completar la acción." }, { status: 500 });
  }
}
