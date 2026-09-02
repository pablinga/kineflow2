import { NextResponse } from "next/server";
import {
  ANY_PROFESSIONAL_ID,
  getFreeSlots,
  getPublicProfessionals,
  getWorkspace,
  isWorkspaceReadOnlyForBooking,
  normalizeDuration,
  PUBLIC_BOOKING_UNAVAILABLE_MESSAGE,
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
  const rawDurationMinutes = searchParams.get("durationMinutes");
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
    if (professionalId === ANY_PROFESSIONAL_ID) {
      const workspace = await getWorkspace(admin, workspaceId);

      if (!workspace || workspace.type !== "CLINICA") {
        return NextResponse.json(
          { error: "No encontramos el profesional para este enlace." },
          { status: 404 },
        );
      }

      const durationMinutes = normalizeDuration(
        rawDurationMinutes,
        workspace.default_session_duration_minutes,
      );

      const professionals = await getPublicProfessionals(admin, workspace);
      const slotsByStart = new Map<
        string,
        Awaited<ReturnType<typeof getFreeSlots>>[number]
      >();
      let firstContext: Awaited<
        ReturnType<typeof resolveBookingContext>
      > = null;

      for (const professional of professionals) {
        const context = await resolveBookingContext(
          admin,
          workspaceId,
          professional.id,
        );

        if (!context) {
          continue;
        }

        firstContext ??= context;

        if (await isWorkspaceReadOnlyForBooking(admin, context)) {
          continue;
        }

        const professionalSlots = await getFreeSlots({
          admin,
          context,
          durationMinutes,
          from,
          to,
        });

        for (const slot of professionalSlots) {
          if (!slotsByStart.has(slot.start)) {
            slotsByStart.set(slot.start, slot);
          }
        }
      }

      const slots = Array.from(slotsByStart.values()).sort(
        (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );

      return NextResponse.json({
        durationMinutes,
        message: firstContext ? undefined : PUBLIC_BOOKING_UNAVAILABLE_MESSAGE,
        slots,
      });
    }

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

    const durationMinutes = normalizeDuration(
      rawDurationMinutes,
      bookingContext.workspace.default_session_duration_minutes,
    );

    if (await isWorkspaceReadOnlyForBooking(admin, bookingContext)) {
      return NextResponse.json({
        durationMinutes,
        message: PUBLIC_BOOKING_UNAVAILABLE_MESSAGE,
        slots: [],
      });
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
