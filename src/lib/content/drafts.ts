import "server-only";

import { randomUUID } from "node:crypto";
import {
  CONTENT_SIZES,
  CONTENT_TEMPLATES,
  FEATURE_SCREENSHOTS,
  renderTemplateJpeg,
  type ContentSize,
  type ContentTemplate,
  type TemplateFields,
} from "./render";
import {
  argentinaLocalToUtc,
  buildContentLink,
  CAROUSEL_MAX_ITEMS,
  composeCaption,
  CONTENT_CHANNELS,
  findPersonalData,
  normalizeCampaign,
  normalizeHashtags,
  validateCaption,
  type ContentChannel,
} from "./rules.ts";
import { getAppBaseUrl, getContentDb, uploadContentImage, type ContentRow } from "./server.ts";

// Alta de borradores: la usan el panel (/admin/contenido) y la API del agente.
// Siempre crea filas en "draft": aprobar y publicar son pasos aparte.

export type DraftInput = {
  campaign?: string;
  caption: string;
  channels: ContentChannel[];
  hashtags?: string[];
  /** Agrega el link a kineflow.ar con UTM (en IG va como texto). */
  includeLink?: boolean;
  linkPath?: string;
  /** "AAAA-MM-DDTHH:MM" en hora de Argentina, o ISO con zona. */
  scheduledAt: string;
  size?: ContentSize;
  /** Una plantilla = imagen; 2 a 10 = carrusel. */
  slides: TemplateFields[];
  template: ContentTemplate;
};

export class DraftValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super(errors.join(" "));
    this.name = "DraftValidationError";
    this.errors = errors;
  }
}

const TITLE_MAX = 90;
const SUBTITLE_MAX = 160;

function asString(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max + 1) : "";
}

/** Parsea y valida el cuerpo que llega por JSON (panel o agente). */
export function parseDraftInput(raw: unknown, options: { requireFuture: boolean; now?: Date }): DraftInput {
  const body = (raw ?? {}) as Record<string, unknown>;
  const errors: string[] = [];
  const template = body.template as ContentTemplate;

  if (!CONTENT_TEMPLATES.includes(template)) {
    errors.push(`Plantilla inválida (${CONTENT_TEMPLATES.join(", ")}).`);
  }

  const size = (body.size ?? "feed") as ContentSize;

  if (!(size in CONTENT_SIZES)) {
    errors.push("Tamaño inválido (feed o square).");
  }

  const rawSlides = Array.isArray(body.slides)
    ? body.slides
    : [{ number: body.number, screenshot: body.screenshot, subtitle: body.subtitle, title: body.title }];
  const slides: TemplateFields[] = rawSlides.map((slide) => {
    const item = (slide ?? {}) as Record<string, unknown>;
    const screenshot = typeof item.screenshot === "string" && item.screenshot in FEATURE_SCREENSHOTS
      ? (item.screenshot as TemplateFields["screenshot"])
      : null;

    return {
      number: asString(item.number, 3) || undefined,
      screenshot,
      subtitle: asString(item.subtitle, SUBTITLE_MAX) || undefined,
      title: asString(item.title, TITLE_MAX),
    };
  });

  if (slides.length === 0 || slides.length > CAROUSEL_MAX_ITEMS) {
    errors.push(`Entre 1 y ${CAROUSEL_MAX_ITEMS} imágenes.`);
  }

  slides.forEach((slide, index) => {
    const label = slides.length > 1 ? ` (imagen ${index + 1})` : "";

    if (!slide.title) errors.push(`Falta el título${label}.`);
    if (slide.title.length > TITLE_MAX) errors.push(`El título${label} supera ${TITLE_MAX} caracteres.`);
    if ((slide.subtitle?.length ?? 0) > SUBTITLE_MAX) errors.push(`El subtítulo${label} supera ${SUBTITLE_MAX} caracteres.`);
  });

  const channels = (Array.isArray(body.channels) ? body.channels : [body.channel]).filter(
    (channel): channel is ContentChannel => CONTENT_CHANNELS.includes(channel as ContentChannel),
  );

  if (channels.length === 0) {
    errors.push("Elegí al menos un canal (instagram o facebook).");
  }

  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const hashtags = normalizeHashtags(
    Array.isArray(body.hashtags) ? body.hashtags.filter((tag): tag is string => typeof tag === "string") : [],
  );
  const includeLink = body.includeLink !== false;
  const linkPath = typeof body.linkPath === "string" && body.linkPath.startsWith("/") ? body.linkPath : "/";

  // El caption final (con link de ejemplo y hashtags) tiene que entrar en IG.
  const sampleLink = includeLink
    ? buildContentLink({ baseUrl: getAppBaseUrl(), campaign: String(body.campaign ?? ""), channel: "instagram", contentId: randomUUID(), path: linkPath })
    : null;
  errors.push(...validateCaption(composeCaption({ caption, channel: "instagram", hashtags, linkUrl: sampleLink })));

  let scheduledIso = "";

  try {
    const value = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
    scheduledIso = /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? new Date(value).toISOString() : argentinaLocalToUtc(value);
  } catch {
    errors.push("Fecha inválida. Usá AAAA-MM-DDTHH:MM (hora de Argentina).");
  }

  if (scheduledIso && options.requireFuture && new Date(scheduledIso).getTime() <= (options.now ?? new Date()).getTime()) {
    errors.push("La fecha tiene que ser futura.");
  }

  if (errors.length > 0) {
    throw new DraftValidationError(errors);
  }

  return {
    campaign: normalizeCampaign(typeof body.campaign === "string" ? body.campaign : ""),
    caption,
    channels: [...new Set(channels)],
    hashtags,
    includeLink,
    linkPath,
    scheduledAt: scheduledIso,
    size,
    slides,
    template,
  };
}

/** Rechaza emails, teléfonos y DNI en cualquier texto del borrador. */
export function assertNoPersonalData(input: DraftInput) {
  const texts = [
    input.caption,
    ...(input.hashtags ?? []),
    ...input.slides.flatMap((slide) => [slide.title, slide.subtitle ?? "", slide.number ?? ""]),
  ];
  const found = new Set(texts.flatMap((text) => findPersonalData(text)));

  if (found.size > 0) {
    throw new DraftValidationError([
      `El borrador parece tener datos personales (${[...found].join(", ")}). Sacalos antes de enviarlo.`,
    ]);
  }
}

/** Renderiza, sube y crea una fila "draft" por canal (mismo group_id). */
export async function createDrafts(input: DraftInput, createdBy: string) {
  const size = input.size ?? "feed";
  const imagePaths: string[] = [];

  for (const slide of input.slides) {
    const jpeg = await renderTemplateJpeg(input.template, slide, size);
    imagePaths.push(await uploadContentImage(jpeg));
  }

  const groupId = randomUUID();
  const rows = input.channels.map((channel) => {
    const id = randomUUID();

    return {
      campaign: input.campaign ?? "organico",
      caption: input.caption,
      channel,
      created_by: createdBy,
      format: imagePaths.length > 1 ? "carousel" : "image",
      group_id: groupId,
      hashtags: input.hashtags ?? [],
      id,
      image_paths: imagePaths,
      link_url: input.includeLink
        ? buildContentLink({
            baseUrl: getAppBaseUrl(),
            campaign: input.campaign ?? "organico",
            channel,
            contentId: id,
            path: input.linkPath,
          })
        : null,
      scheduled_at: input.scheduledAt,
      status: "draft",
      template: input.template,
      template_fields: { size, slides: input.slides },
    };
  });

  const { data, error } = await getContentDb()
    .from("content_queue")
    .insert(rows)
    .select("*")
    .returns<ContentRow[]>();

  if (error || !data) {
    throw new Error(error?.message ?? "No pudimos guardar el borrador.");
  }

  return data;
}

/** Copia un post para el otro canal (misma imagen, mismo grupo), como borrador. */
export async function duplicateForOtherChannel(source: ContentRow) {
  const channel: ContentChannel = source.channel === "instagram" ? "facebook" : "instagram";
  const id = randomUUID();
  const { data, error } = await getContentDb()
    .from("content_queue")
    .insert({
      campaign: source.campaign,
      caption: source.caption,
      channel,
      created_by: "admin",
      format: source.format,
      group_id: source.group_id,
      hashtags: source.hashtags,
      id,
      image_paths: source.image_paths,
      link_url: source.link_url
        ? buildContentLink({
            baseUrl: getAppBaseUrl(),
            campaign: source.campaign,
            channel,
            contentId: id,
            path: new URL(source.link_url).pathname,
          })
        : null,
      scheduled_at: source.scheduled_at,
      status: "draft",
      template: source.template,
      template_fields: source.template_fields,
    })
    .select("*")
    .single<ContentRow>();

  if (error || !data) {
    throw new Error(error?.message ?? "No pudimos duplicar el post.");
  }

  return data;
}
