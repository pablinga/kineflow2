import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/content/guards";
import { runPublisher } from "@/lib/content/publisher";
import { buildPublisherDeps } from "@/lib/content/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cada 15 min (pg_cron): publica los posts aprobados con fecha vencida. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const deps = buildPublisherDeps();
  const results = await runPublisher(deps);

  return NextResponse.json({ mode: deps.mode, results });
}
