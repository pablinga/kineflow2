"use client";

import {
  type AcquisitionEventType,
  type Attribution,
  isAttributionExpired,
  parseAttributionFromSearch,
  resolveFirstTouch,
  sanitizeAttribution,
} from "@/lib/attribution";

/**
 * Persistencia first-touch en el navegador (localStorage). Todo envuelto en
 * try/catch: en modo privado o sin storage la app sigue funcionando igual,
 * solo que sin atribución.
 */

const ATTRIBUTION_KEY = "kineflow.attribution.v1";
const VISITOR_KEY = "kineflow.visitor.v1";
const SENT_EVENTS_KEY = "kineflow.attribution.events.v1";

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin storage: no hay atribución, pero no se rompe nada.
  }
}

/** Atribución guardada y vigente (las vencidas se ignoran). */
export function getStoredAttribution(): Attribution | null {
  const attribution = sanitizeAttribution(readJson(ATTRIBUTION_KEY));

  return attribution && !isAttributionExpired(attribution) ? attribution : null;
}

/** Identificador anónimo del navegador, para unir eventos y registro. */
export function getVisitorId(): string | null {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);

    if (existing) {
      return existing;
    }

    const created = crypto.randomUUID();
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return null;
  }
}

/**
 * Captura los UTM de la URL actual respetando first touch. Devuelve la
 * atribución vigente (la guardada, la nueva o null).
 */
export function captureAttributionFromLocation(): Attribution | null {
  const stored = getStoredAttribution();
  const incoming = parseAttributionFromSearch({
    landingPage: window.location.pathname,
    ownHost: window.location.host,
    referrer: document.referrer,
    search: window.location.search,
  });
  const resolved = resolveFirstTouch(stored, incoming);

  if (resolved && resolved !== stored) {
    writeJson(ATTRIBUTION_KEY, resolved);
  }

  return resolved;
}

/** Datos que viajan en user_metadata.attribution al registrarse. */
export function getSignupAttributionMetadata() {
  const attribution = getStoredAttribution();

  if (!attribution) {
    return null;
  }

  return { ...attribution, visitor_id: getVisitorId() };
}

/**
 * Registra un evento del embudo (una vez por navegador y tipo). Solo para
 * visitas con atribución: el resto del tráfico ya lo mide Vercel Analytics.
 */
export function trackAcquisitionEvent(eventType: AcquisitionEventType) {
  const attribution = getStoredAttribution();
  const visitorId = getVisitorId();

  if (!attribution || !visitorId) {
    return;
  }

  // Una vez por tipo y por atribución (si vence y llega otra campaña, cuenta).
  const eventKey = `${eventType}:${attribution.first_visited_at}`;
  const sent = readJson(SENT_EVENTS_KEY);
  const sentEvents = Array.isArray(sent) ? (sent as string[]) : [];

  if (sentEvents.includes(eventKey)) {
    return;
  }

  writeJson(SENT_EVENTS_KEY, [...sentEvents.slice(-20), eventKey]);

  void fetch("/api/acquisition/event", {
    body: JSON.stringify({ attribution, eventType, visitorId }),
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => {
    // El tracking nunca debe afectar la navegación.
  });
}
