import { NextResponse } from "next/server";
import {
  assertNoPersonalData,
  createDrafts,
  DraftValidationError,
  parseDraftInput,
} from "@/lib/content/drafts";
import { isAgentRequest } from "@/lib/content/guards";
import { sendDraftDigest } from "@/lib/content/notify";
import { AGENT_MAX_DRAFTS_PER_DAY, startOfArgentinaDayUtc } from "@/lib/content/rules";
import { getContentDb } from "@/lib/content/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * API del agente comercial (Authorization: Bearer CONTENT_AGENT_SECRET).
 * Solo crea borradores: no hay forma de aprobar ni publicar desde acá.
 */
export async function POST(request: Request) {
  if (!isAgentRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const input = parseDraftInput(await request.json().catch(() => null), { requireFuture: true });
    assertNoPersonalData(input);

    // Tope diario (hora de Argentina): un borrador = un grupo, aunque vaya a 2 canales.
    const { data: today, error: countError } = await getContentDb()
      .from("content_queue")
      .select("group_id")
      .eq("created_by", "agente")
      .gte("created_at", startOfArgentinaDayUtc(new Date()));

    if (countError) {
      throw new Error(countError.message);
    }

    const groupsToday = new Set((today ?? []).map((row) => row.group_id)).size;

    if (groupsToday >= AGENT_MAX_DRAFTS_PER_DAY) {
      return NextResponse.json(
        { error: `Se alcanzó el máximo de ${AGENT_MAX_DRAFTS_PER_DAY} borradores por día.` },
        { status: 429 },
      );
    }

    const rows = await createDrafts(input, "agente");

    // Aviso inmediato con los botones de aprobar / rechazar.
    await sendDraftDigest(rows, "new").catch((error) => console.error("[content] mail de borrador", error));

    return NextResponse.json(
      { drafts: rows.map((row) => ({ channel: row.channel, id: row.id, status: row.status })) },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DraftValidationError) {
      return NextResponse.json({ error: error.message, errors: error.errors }, { status: 400 });
    }

    console.error("[content] borrador del agente", error);
    return NextResponse.json({ error: "No pudimos crear el borrador." }, { status: 500 });
  }
}
