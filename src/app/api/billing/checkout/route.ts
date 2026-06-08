import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "El checkout de suscripción se inicia directamente desde el frontend.",
    },
    { status: 410 },
  );
}
