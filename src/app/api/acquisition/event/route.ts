import { NextRequest, NextResponse } from "next/server";
import {
  isAcquisitionEventType,
  isVisitorId,
  sanitizeAttribution,
} from "@/lib/attribution";
import { getSupabaseAdminClient } from "@/lib/supabase-server";

/**
 * Eventos del embudo de adquisición (landing_view, signup_started) para
 * visitas con UTM. Público y anónimo: valida y sanea todo, y guarda una sola
 * vez por visitante, tipo de evento y atribución (índice único en la base).
 * signup_completed no pasa por acá: lo registra el trigger del alta en
 * user_attribution.
 */

const LOG_PREFIX = "[acquisition:event]";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    attribution?: unknown;
    eventType?: unknown;
    visitorId?: unknown;
  } | null;
  const attribution = sanitizeAttribution(body?.attribution);

  if (!body || !isAcquisitionEventType(body.eventType) || !isVisitorId(body.visitorId) || !attribution) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  const { error } = await admin.from("acquisition_events").upsert(
    {
      event_type: body.eventType,
      first_visited_at: attribution.first_visited_at,
      landing_page: attribution.landing_page,
      referrer: attribution.referrer,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_medium: attribution.utm_medium,
      utm_source: attribution.utm_source,
      utm_term: attribution.utm_term,
      visitor_id: body.visitorId,
    },
    { ignoreDuplicates: true, onConflict: "visitor_id,event_type,first_visited_at" },
  );

  if (error) {
    console.error(`${LOG_PREFIX} insert failed`, { code: error.code });
    // No es un error para el visitante: el tracking nunca bloquea la navegación.
    return NextResponse.json({ ok: false }, { status: 202 });
  }

  return NextResponse.json({ ok: true });
}
