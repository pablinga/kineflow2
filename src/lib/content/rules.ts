// Publicador de contenido en redes propias: reglas puras (sin red ni base),
// compartidas por el panel, la API del agente, el cron y los tests.

export const CONTENT_CHANNELS = ["instagram", "facebook"] as const;
export type ContentChannel = (typeof CONTENT_CHANNELS)[number];

export const CONTENT_FORMATS = ["image", "carousel"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const CONTENT_STATUSES = [
  "draft",
  "approved",
  "publishing",
  "published",
  "failed",
  "rejected",
  "published_dry_run",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Límites de Instagram (IG User Media): 2200 caracteres, 30 hashtags, 20 menciones. */
export const IG_CAPTION_MAX_LENGTH = 2200;
export const IG_MAX_HASHTAGS = 30;
export const IG_MAX_MENTIONS = 20;
export const CAROUSEL_MAX_ITEMS = 10;

export const MAX_PUBLISH_ATTEMPTS = 3;
export const AGENT_MAX_DRAFTS_PER_DAY = 5;
export const APPROVAL_LINK_TTL_HOURS = 72;

const ARGENTINA_OFFSET = "-03:00"; // Argentina no tiene horario de verano.
const CAMPAIGN_PATTERN = /^[a-z0-9._~-]{1,100}$/;

/**
 * Transiciones válidas. "publishing" solo lo pone el cron (update
 * condicional) y vuelve a "approved" para reintentar o reprogramar.
 */
const TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  approved: ["draft", "publishing", "rejected"],
  draft: ["approved", "rejected"],
  failed: ["draft", "approved"],
  publishing: ["published", "published_dry_run", "failed", "approved"],
  published: [],
  published_dry_run: [],
  rejected: ["draft"],
};

export function canTransition(from: ContentStatus, to: ContentStatus) {
  return TRANSITIONS[from].includes(to);
}

/** Se puede editar texto y fecha mientras no se esté publicando ni se haya publicado. */
export function isEditableStatus(status: ContentStatus) {
  return status === "draft" || status === "approved" || status === "failed" || status === "rejected";
}

export function normalizeCampaign(value: string | null | undefined) {
  const slug = (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

  return CAMPAIGN_PATTERN.test(slug) ? slug : "organico";
}

/** Link a la landing con los UTM del post (utm_content = id del post). */
export function buildContentLink(params: {
  baseUrl: string;
  campaign: string;
  channel: ContentChannel;
  contentId: string;
  path?: string;
}) {
  const url = new URL(params.path ?? "/", params.baseUrl);

  url.searchParams.set("utm_source", params.channel);
  url.searchParams.set("utm_medium", "post");
  url.searchParams.set("utm_campaign", normalizeCampaign(params.campaign));
  url.searchParams.set("utm_content", params.contentId);

  return url.toString();
}

export function normalizeHashtags(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const tag = value
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, "");

    if (!tag || seen.has(tag.toLowerCase())) {
      continue;
    }

    seen.add(tag.toLowerCase());
    result.push(tag);
  }

  return result;
}

/**
 * Texto final tal como se publica. En Instagram los links no son
 * clickeables: va como texto. En Facebook el link queda clickeable.
 */
export function composeCaption(params: {
  caption: string;
  channel: ContentChannel;
  hashtags: string[];
  linkUrl?: string | null;
}) {
  const parts = [params.caption.trim()];

  if (params.linkUrl) {
    parts.push(
      params.channel === "instagram"
        ? `Más info: ${params.linkUrl}`
        : params.linkUrl,
    );
  }

  const tags = normalizeHashtags(params.hashtags);

  if (tags.length > 0) {
    parts.push(tags.map((tag) => `#${tag}`).join(" "));
  }

  return parts.filter(Boolean).join("\n\n");
}

export function validateCaption(finalCaption: string) {
  const errors: string[] = [];
  const hashtags = finalCaption.match(/(^|\s)#[^\s#]+/g) ?? [];
  const mentions = finalCaption.match(/(^|\s)@[A-Za-z0-9._]+/g) ?? [];

  if (!finalCaption.trim()) {
    errors.push("El texto está vacío.");
  }

  if ([...finalCaption].length > IG_CAPTION_MAX_LENGTH) {
    errors.push(
      `El texto supera los ${IG_CAPTION_MAX_LENGTH} caracteres de Instagram (tiene ${[...finalCaption].length}).`,
    );
  }

  if (hashtags.length > IG_MAX_HASHTAGS) {
    errors.push(`Instagram admite hasta ${IG_MAX_HASHTAGS} hashtags (hay ${hashtags.length}).`);
  }

  if (mentions.length > IG_MAX_MENTIONS) {
    errors.push(`Instagram admite hasta ${IG_MAX_MENTIONS} menciones (hay ${mentions.length}).`);
  }

  return errors;
}

export type PersonalDataKind = "email" | "telefono" | "dni";

/**
 * Filtro básico de datos personales para lo que llega del agente: emails,
 * teléfonos y DNI. No es exhaustivo; es una red de seguridad. Los montos con
 * "$" no cuentan como DNI ni teléfono.
 */
export function findPersonalData(text: string): PersonalDataKind[] {
  const found = new Set<PersonalDataKind>();

  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) {
    found.add("email");
  }

  // Sacamos montos ($ 20.000, $1.250.000) y URLs antes de buscar números.
  const withoutNoise = text
    .replace(/\$\s?[\d.,]+/g, " ")
    .replace(/https?:\/\/\S+/g, " ");

  // DNI: 7 u 8 dígitos, con o sin puntos (30.123.456 / 30123456).
  if (/(^|[^\d.])(\d{1,2}\.\d{3}\.\d{3}|\d{7,8})(?![\d.])/.test(withoutNoise)) {
    found.add("dni");
  }

  // Teléfono: + opcional y 10 o más dígitos con espacios, guiones o paréntesis.
  const phoneCandidates = withoutNoise.match(/\+?\(?\d[\d\s()-]{8,}\d/g) ?? [];

  if (phoneCandidates.some((candidate) => candidate.replace(/\D/g, "").length >= 10)) {
    found.add("telefono");
  }

  return [...found];
}

/** "2026-10-15T10:30" (hora de Argentina) -> ISO UTC. */
export function argentinaLocalToUtc(local: string) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(local.trim());

  if (!match) {
    throw new Error("Fecha inválida. Usá AAAA-MM-DDTHH:MM.");
  }

  const date = new Date(`${match[1]}T${match[2]}:00${ARGENTINA_OFFSET}`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Fecha inválida.");
  }

  return date.toISOString();
}

/** ISO UTC -> "2026-10-15T10:30" en hora de Argentina (para inputs datetime-local). */
export function utcToArgentinaLocal(iso: string) {
  const shifted = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);

  return shifted.toISOString().slice(0, 16);
}

export type DueCandidate = {
  id: string;
  next_attempt_at: string | null;
  scheduled_at: string;
  status: ContentStatus;
};

/** Posts que el cron tiene que publicar ahora, en orden de fecha. */
export function selectDuePosts<T extends DueCandidate>(posts: T[], now: Date) {
  const nowMs = now.getTime();

  return posts
    .filter(
      (post) =>
        post.status === "approved" &&
        new Date(post.scheduled_at).getTime() <= nowMs &&
        (!post.next_attempt_at || new Date(post.next_attempt_at).getTime() <= nowMs),
    )
    .sort(
      (left, right) =>
        new Date(left.scheduled_at).getTime() - new Date(right.scheduled_at).getTime(),
    );
}

/** Espera antes del próximo intento: 15 min después del 1.º fallo, 60 después del 2.º. */
export function retryDelayMinutes(attempt: number) {
  return attempt <= 1 ? 15 : 60;
}

/** Inicio del día (UTC) del día de hoy en Argentina, para el tope diario del agente. */
export function startOfArgentinaDayUtc(now: Date) {
  const local = utcToArgentinaLocal(now.toISOString()).slice(0, 10);

  return new Date(`${local}T00:00:00${ARGENTINA_OFFSET}`).toISOString();
}
