/**
 * Atribución de adquisición (UTM) first-touch.
 *
 * Lógica pura (sin window), compartida por el cliente, la API de eventos y los
 * tests. La persistencia en el navegador está en attribution-client.ts.
 *
 * Privacidad: los UTM solo aceptan slugs (letras, números, . _ ~ -). Cualquier
 * valor con "@" o caracteres raros se descarta, así un email o un nombre con
 * espacios nunca se guarda aunque venga en la URL.
 */

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];

export type Attribution = {
  first_visited_at: string;
  landing_page: string;
  referrer: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_medium: string | null;
  utm_source: string;
  utm_term: string | null;
};

/** La atribución vence a los 90 días si el usuario no se registra. */
export const ATTRIBUTION_TTL_DAYS = 90;

const SLUG_PATTERN = /^[A-Za-z0-9._~-]{1,100}$/;
const MAX_PATH_LENGTH = 300;
const MAX_REFERRER_LENGTH = 300;

/** Devuelve el slug normalizado (minúsculas) o null si no es un slug válido. */
export function sanitizeUtmValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.includes("@") || !SLUG_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed.toLowerCase();
}

/** Solo el path de la landing (sin query ni hash: ahí podrían viajar datos). */
export function sanitizeLandingPage(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return "/";
  }

  const path = value.split(/[?#]/)[0] ?? "/";

  return path.slice(0, MAX_PATH_LENGTH) || "/";
}

/** Solo el origen del referrer (sin path ni query), y nunca el propio sitio. */
export function sanitizeReferrer(value: unknown, ownHost?: string): string | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    if (ownHost && url.host === ownHost) {
      return null;
    }

    return url.origin.slice(0, MAX_REFERRER_LENGTH);
  } catch {
    return null;
  }
}

function sanitizeTimestamp(value: unknown, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const time = Date.parse(value);

  return Number.isFinite(time) ? new Date(time).toISOString() : fallback;
}

/**
 * Arma la atribución a partir de los parámetros de la URL. Devuelve null si
 * no hay un utm_source válido (sin fuente no hay campaña que atribuir).
 */
export function parseAttributionFromSearch(params: {
  landingPage: string;
  now?: Date;
  ownHost?: string;
  referrer?: string | null;
  search: string;
}): Attribution | null {
  let searchParams: URLSearchParams;

  try {
    searchParams = new URLSearchParams(params.search);
  } catch {
    return null;
  }

  const source = sanitizeUtmValue(searchParams.get("utm_source"));

  if (!source) {
    return null;
  }

  return {
    first_visited_at: (params.now ?? new Date()).toISOString(),
    landing_page: sanitizeLandingPage(params.landingPage),
    referrer: sanitizeReferrer(params.referrer, params.ownHost),
    utm_campaign: sanitizeUtmValue(searchParams.get("utm_campaign")),
    utm_content: sanitizeUtmValue(searchParams.get("utm_content")),
    utm_medium: sanitizeUtmValue(searchParams.get("utm_medium")),
    utm_source: source,
    utm_term: sanitizeUtmValue(searchParams.get("utm_term")),
  };
}

/**
 * Valida una atribución que viene de afuera (localStorage o el body de la
 * API). Devuelve null si no es válida.
 */
export function sanitizeAttribution(value: unknown): Attribution | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const source = sanitizeUtmValue(raw.utm_source);

  if (!source) {
    return null;
  }

  return {
    first_visited_at: sanitizeTimestamp(raw.first_visited_at, new Date().toISOString()),
    landing_page: sanitizeLandingPage(raw.landing_page),
    referrer: sanitizeReferrer(raw.referrer),
    utm_campaign: sanitizeUtmValue(raw.utm_campaign),
    utm_content: sanitizeUtmValue(raw.utm_content),
    utm_medium: sanitizeUtmValue(raw.utm_medium),
    utm_source: source,
    utm_term: sanitizeUtmValue(raw.utm_term),
  };
}

export function isAttributionExpired(attribution: Attribution, now = new Date()) {
  const firstVisit = Date.parse(attribution.first_visited_at);

  return (
    !Number.isFinite(firstVisit) ||
    now.getTime() - firstVisit > ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000
  );
}

/**
 * First touch: una atribución guardada y vigente nunca se reemplaza, ni por
 * una visita sin UTM ni por otra campaña. Solo se toma la nueva si no había
 * ninguna o la anterior venció.
 */
export function resolveFirstTouch(
  stored: Attribution | null,
  incoming: Attribution | null,
  now = new Date(),
): Attribution | null {
  if (stored && !isAttributionExpired(stored, now)) {
    return stored;
  }

  return incoming;
}

export const ACQUISITION_EVENT_TYPES = ["landing_view", "signup_started"] as const;
export type AcquisitionEventType = (typeof ACQUISITION_EVENT_TYPES)[number];

export function isAcquisitionEventType(value: unknown): value is AcquisitionEventType {
  return (
    typeof value === "string" &&
    (ACQUISITION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isVisitorId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
