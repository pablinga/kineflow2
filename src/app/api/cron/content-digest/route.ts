import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/content/guards";
import { sendDraftDigest } from "@/lib/content/notify";
import { getContentDb, type ContentRow } from "@/lib/content/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Una vez por día: resumen de los borradores pendientes con fecha futura. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data, error } = await getContentDb()
    .from("content_queue")
    .select("*")
    .eq("status", "draft")
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(10)
    .returns<ContentRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = await sendDraftDigest(data ?? [], "daily");

  return NextResponse.json({ drafts: data?.length ?? 0, sent: result.sent });
}
