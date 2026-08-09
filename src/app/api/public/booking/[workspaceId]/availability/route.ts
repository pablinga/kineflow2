import { NextResponse } from "next/server";
import {
  getFreeSlots,
  normalizeDuration,
  resolveBookingContext,
} from "@/lib/public-booking";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

function isDateValue(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: Request, context: RouteContext) {
  const { workspaceId } = await context.params;
  const { searchParams } = new URL(request.url);
  const professionalId = searchParams.get("professionalId") ?? "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const durationMinutes = normalizeDuration(searchParams.get("durationMinutes"));
  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase admin no está configurado." },
      { status: 500 },
    );
  }

  if (!professionalId || !isDateValue(from) || !isDateValue(to) || !from || !to) {
    return NextResponse.json(
      { error: "Faltan datos para consultar disponibilidad." },
      { status: 400 },
    );
  }

  const rangeDays =
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
    86_400_000;

  if (rangeDays < 0 || rangeDays > 31) {
    return NextResponse.json(
      { error: "El rango de fechas no es válido." },
      { status: 400 },
    );
  }

  try {
    const bookingContext = await resolveBookingContext(
      admin,
      workspaceId,
      professionalId,
    );

    if (!bookingContext) {
      return NextResponse.json(
        { error: "No encontramos el profesional para este enlace." },
        { status: 404 },
      );
    }

    const slots = await getFreeSlots({
      admin,
      context: bookingContext,
      durationMinutes,
      from,
      to,
    });

    return NextResponse.json({ durationMinutes, slots });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No pudimos calcular la disponibilidad.",
      },
      { status: 500 },
    );
  }
}
