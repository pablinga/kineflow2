import { NextRequest, NextResponse } from "next/server";
import {
  ANY_PROFESSIONAL_ID,
  getArgentinaHolidaysInRange,
  getFreeSlots,
  getPublicProfessionals,
  getWorkspace,
  normalizeDuration,
  resolveBookingContext,
} from "@/lib/public-booking";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

/**
 * Horarios libres para que el staff de una clínica dé un turno desde el
 * dashboard (misma lógica que la reserva online, en modo "staff").
 *
 * GET ?workspaceId&professionalId (clinic_professional id o "any")&from&to
 *     &durationMinutes&allowsSimultaneous=true|false
 *
 * Respuesta: { durationMinutes, holidays, slots: [{ date, start, end,
 * startTime, endTime, professionals: [{ clinicProfessionalId, professionalId,
 * name }] }] }. Nunca devuelve datos de pacientes.
 */

const LOG_PREFIX = "[appointments:availability]";

type StaffProfessional = {
  clinicProfessionalId: string;
  name: string;
  /** owner_id del turno (profiles.id del profesional). */
  professionalId: string;
};

type StaffSlot = {
  date: string;
  end: string;
  endTime: string;
  professionals: StaffProfessional[];
  start: string;
  startTime: string;
};

function isDateValue(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!accessToken) {
    return jsonError("No pudimos validar la sesión.", 401);
  }

  const supabase = getSupabaseServerClient(accessToken);
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return jsonError("No pudimos validar la sesión.", 401);
  }

  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId")?.trim() ?? "";
  const professionalId = searchParams.get("professionalId")?.trim() ?? "";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const rawAllowsSimultaneous = searchParams.get("allowsSimultaneous");
  const allowsSimultaneous =
    rawAllowsSimultaneous === "true"
      ? true
      : rawAllowsSimultaneous === "false"
        ? false
        : undefined;

  if (!workspaceId || !professionalId || !isDateValue(from) || !isDateValue(to)) {
    return jsonError("Faltan datos para consultar disponibilidad.", 400);
  }

  const rangeDays =
    (new Date(`${to}T00:00:00.000Z`).getTime() -
      new Date(`${from}T00:00:00.000Z`).getTime()) /
    86_400_000;

  if (rangeDays < 0 || rangeDays > 31) {
    return jsonError("El rango de fechas no es válido.", 400);
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    console.error(`${LOG_PREFIX} admin client not configured`);
    return jsonError("No pudimos calcular la disponibilidad.", 500);
  }

  const { data: isStaff, error: staffError } = await supabase.rpc("is_workspace_staff", {
    target_workspace_id: workspaceId,
  });

  if (staffError) {
    console.error(`${LOG_PREFIX} staff check failed`, { code: staffError.code });
    return jsonError("No pudimos validar tus permisos.", 500);
  }

  if (!isStaff) {
    return jsonError("No tenés permisos para dar turnos en esta clínica.", 403);
  }

  try {
    const workspace = await getWorkspace(admin, workspaceId);

    if (!workspace || workspace.type !== "CLINICA") {
      return jsonError("La disponibilidad por profesional solo está disponible para clínicas.", 400);
    }

    const durationMinutes = normalizeDuration(
      searchParams.get("durationMinutes"),
      workspace.default_session_duration_minutes,
    );
    const professionals = await getPublicProfessionals(admin, workspace);
    const targets =
      professionalId === ANY_PROFESSIONAL_ID
        ? professionals
        : professionals.filter((professional) => professional.id === professionalId);

    if (professionalId !== ANY_PROFESSIONAL_ID && targets.length === 0) {
      return jsonError("No encontramos ese profesional en la clínica.", 404);
    }

    const slotsByStart = new Map<string, StaffSlot>();

    for (const target of targets) {
      const context = await resolveBookingContext(admin, workspaceId, target.id);

      if (!context?.clinicProfessionalId) {
        continue;
      }

      const professional: StaffProfessional = {
        clinicProfessionalId: context.clinicProfessionalId,
        name: context.professional.name,
        professionalId: context.ownerId,
      };
      const freeSlots = await getFreeSlots({
        admin,
        allowsSimultaneous,
        context,
        durationMinutes,
        from,
        mode: "staff",
        to,
      });

      for (const slot of freeSlots) {
        const existing = slotsByStart.get(slot.start);

        if (existing) {
          existing.professionals.push(professional);
        } else {
          slotsByStart.set(slot.start, { ...slot, professionals: [professional] });
        }
      }
    }

    const slots = Array.from(slotsByStart.values()).sort(
      (left, right) => new Date(left.start).getTime() - new Date(right.start).getTime(),
    );

    return NextResponse.json({
      durationMinutes,
      holidays: getArgentinaHolidaysInRange(from, to),
      slots,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} failed`, {
      message: error instanceof Error ? error.message : "unknown",
    });
    return jsonError("No pudimos calcular la disponibilidad.", 500);
  }
}
