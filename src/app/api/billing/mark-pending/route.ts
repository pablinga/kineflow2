import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Este endpoint fue reemplazado por /api/billing/confirm-return, que solo consulta el estado. La activacion ocurre por webhook.",
    },
    { status: 410 },
  );
}
