import { NextResponse } from "next/server";
import { createDrafts, DraftValidationError, parseDraftInput } from "@/lib/content/drafts";
import { requireAdminApi } from "@/lib/content/guards";

export const runtime = "nodejs";

/** Alta manual desde el panel: siempre queda como borrador. */
export async function POST(request: Request) {
  const denied = await requireAdminApi();

  if (denied) {
    return denied;
  }

  try {
    const input = parseDraftInput(await request.json().catch(() => null), { requireFuture: false });
    const rows = await createDrafts(input, "admin");

    return NextResponse.json({ ids: rows.map((row) => row.id) });
  } catch (error) {
    if (error instanceof DraftValidationError) {
      return NextResponse.json({ error: error.message, errors: error.errors }, { status: 400 });
    }

    console.error("[content] alta manual", error);
    return NextResponse.json({ error: "No pudimos crear el borrador." }, { status: 500 });
  }
}
