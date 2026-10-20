import { NextRequest, NextResponse } from "next/server";
import {
  ANY_PROFESSIONAL_ID,
  getArgentinaHolidaysInRange,
  getFreeSlots,
  getWorkspace,
  getWorkspaceBookingContexts,
  normalizeDuration,
} from "@/lib/public-booking";
import {
  getSupabaseAdminClient,
  getSupabaseServerClient,
} from "@/lib/supabase-server";

/**
 * Horarios libres para dar un turno desde el dashboard (misma lógica que la
 * reserva online, en modo "staff"): el staff de una clínica, o el kinesiólogo
 * en su espacio particular (según sus horarios de Reservas online).
 *
 * GET ?workspaceId&professionalId (clinic_professional id o "any"; en el
 *     espacio particular se ignora)&from&to&durationMinutes
 *     &allowsSimultaneous=true|false
 *
 * Respuesta: { durationMinutes, holidays, slots: [{ date, start, end,
 * startTime, endTime, professionals: [{ clinicProfessionalId, professionalId,
 * name }] }] } (en el espacio particular, professionals vacío). Nunca
 * devuelve datos de pacientes.
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

  try {
    // Cada consulta cruza de la función a la base: las que no dependen entre
    // sí salen juntas. El workspace se lee junto con la sesión, pero no se usa
    // ni se devuelve nada hasta validarla.
    const [{ data: userData, error: userError }, workspaceResult] = await Promise.all([
      supabase.auth.getUser(accessToken),
      getWorkspace(admin, workspaceId).then(
        (value) => ({ error: null, value }),
        (error: unknown) => ({ error, value: null }),
      ),
    ]);

    if (userError || !userData.user) {
      return jsonError("No pudimos validar la sesión.", 401);
    }

    if (workspaceResult.error) {
      throw workspaceResult.error;
    }

    const workspace = workspaceResult.value;

    if (!workspace) {
      return jsonError("No encontramos el espacio de trabajo.", 404);
    }

    // Espacio particular: solo su dueño, con sus propios horarios.
    if (workspace.type === "PERSONAL") {
      if (!workspace.owner_id || workspace.owner_id !== userData.user.id) {
        return jsonError("No tenés permisos para dar turnos en este espacio.", 403);
      }

      const [context] = await getWorkspaceBookingContexts(admin, workspace);

      if (!context) {
        return jsonError("No pudimos calcular la disponibilidad.", 500);
      }

      const durationMinutes = normalizeDuration(
        searchParams.get("durationMinutes"),
        workspace.default_session_duration_minutes,
      );
      const freeSlots = await getFreeSlots({
        admin,
        allowsSimultaneous,
        context,
        durationMinutes,
        from,
        mode: "staff",
        to,
      });

      return NextResponse.json({
        durationMinutes,
        holidays: getArgentinaHolidaysInRange(from, to),
        slots: freeSlots.map((slot) => ({ ...slot, professionals: [] })),
      });
    }

    const [{ data: isStaff, error: staffError }, contexts] = await Promise.all([
      supabase.rpc("is_workspace_staff", { target_workspace_id: workspaceId }),
      getWorkspaceBookingContexts(admin, workspace),
    ]);

    if (staffError) {
      console.error(`${LOG_PREFIX} staff check failed`, { code: staffError.code });
      return jsonError("No pudimos validar tus permisos.", 500);
    }

    if (!isStaff) {
      return jsonError("No tenés permisos para dar turnos en esta clínica.", 403);
    }

    if (workspace.type !== "CLINICA") {
      return jsonError("La disponibilidad por profesional solo está disponible para clínicas.", 400);
    }

    const durationMinutes = normalizeDuration(
      searchParams.get("durationMinutes"),
      workspace.default_session_duration_minutes,
    );
    const targets =
      professionalId === ANY_PROFESSIONAL_ID
        ? contexts
        : contexts.filter((context) => context.clinicProfessionalId === professionalId);

    if (professionalId !== ANY_PROFESSIONAL_ID && targets.length === 0) {
      return jsonError("No encontramos ese profesional en la clínica.", 404);
    }

    const slotsByStart = new Map<string, StaffSlot>();
    // Todos los profesionales en paralelo; el armado sigue el orden de la
    // lista para que la respuesta no dependa de cuál termina primero.
    const freeSlotsByTarget = await Promise.all(
      targets.map((context) =>
        getFreeSlots({
          admin,
          allowsSimultaneous,
          context,
          durationMinutes,
          from,
          mode: "staff",
          to,
        }),
      ),
    );

    targets.forEach((context, index) => {
      const professional: StaffProfessional = {
        clinicProfessionalId: context.clinicProfessionalId ?? context.professional.id,
        name: context.professional.name,
        professionalId: context.ownerId,
      };

      for (const slot of freeSlotsByTarget[index]) {
        const existing = slotsByStart.get(slot.start);

        if (existing) {
          existing.professionals.push(professional);
        } else {
          slotsByStart.set(slot.start, { ...slot, professionals: [professional] });
        }
      }
    });

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
