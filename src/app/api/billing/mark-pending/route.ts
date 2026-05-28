import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Este endpoint fue reemplazado por /api/billing/confirm-return, que valida Mercado Pago antes de actualizar el plan.",
    },
    { status: 410 },
  );
}
