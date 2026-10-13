// Cliente mínimo de la Graph API de Meta con fetch (sin SDK). El token va en
// el header Authorization, nunca en la URL, y los logs no lo incluyen.
//
// Instagram (Content Publishing): POST /{ig-user-id}/media (contenedor),
// GET /{container-id}?fields=status_code (IN_PROGRESS | FINISHED | ERROR |
// EXPIRED | PUBLISHED), POST /{ig-user-id}/media_publish, y el cupo en
// GET /{ig-user-id}/content_publishing_limit.
// Facebook (Pages API): POST /{page-id}/photos, /{page-id}/feed, con un Page
// access token que se pide con el token del System User.

export type MetaConfig = {
  accessToken: string;
  graphVersion: string;
  igUserId: string;
  pageId: string;
};

export type MetaErrorKind = "auth" | "rate_limit" | "transient" | "invalid";

export class MetaApiError extends Error {
  code: number | null;
  httpStatus: number;
  kind: MetaErrorKind;
  subcode: number | null;

  constructor(params: {
    code: number | null;
    httpStatus: number;
    message: string;
    subcode: number | null;
  }) {
    super(params.message);
    this.name = "MetaApiError";
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.subcode = params.subcode;
    this.kind = classifyMetaError(params);
  }
}

/**
 * - auth: token vencido / inválido / sin permisos (190, 102, 10, 200-299):
 *   no se reintenta, se avisa.
 * - rate_limit: límites de llamadas (4, 17, 32, 613) o de publicación de IG
 *   (9 / 2207042): se reprograma.
 * - transient: 5xx, timeouts, 1/2: se reintenta con backoff.
 * - invalid: el resto (imagen inválida, parámetros): se reintenta igual
 *   hasta el máximo por si es temporal, y queda el error legible.
 */
export function classifyMetaError(params: {
  code: number | null;
  httpStatus: number;
  subcode: number | null;
}): MetaErrorKind {
  const { code, httpStatus, subcode } = params;

  if (code === 190 || code === 102 || code === 10 || (code !== null && code >= 200 && code < 300)) {
    return "auth";
  }

  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 9 || subcode === 2207042) {
    return "rate_limit";
  }

  if (httpStatus >= 500 || httpStatus === 0 || code === 1 || code === 2) {
    return "transient";
  }

  return "invalid";
}

export type MetaCallLog = {
  durationMs: number;
  method: string;
  path: string;
  status: number;
};

export type MetaClientDeps = {
  fetch: typeof fetch;
  log?: (entry: MetaCallLog) => void;
  sleep?: (ms: number) => Promise<void>;
};

type GraphParams = Record<string, string | number | boolean | undefined>;

export function createMetaClient(config: MetaConfig, deps: MetaClientDeps) {
  const base = `https://graph.facebook.com/${config.graphVersion}`;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let pageToken: string | null = null;

  async function call<T>(
    method: "GET" | "POST",
    path: string,
    params: GraphParams = {},
    token = config.accessToken,
  ): Promise<T> {
    const started = Date.now();
    const search = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        search.set(key, String(value));
      }
    }

    const url = method === "GET" && search.size > 0 ? `${base}${path}?${search}` : `${base}${path}`;
    let response: Response;

    try {
      response = await deps.fetch(url, {
        body: method === "POST" ? search : undefined,
        headers: { Authorization: `Bearer ${token}` },
        method,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      deps.log?.({ durationMs: Date.now() - started, method, path, status: 0 });
      throw new MetaApiError({
        code: null,
        httpStatus: 0,
        message: `No pudimos conectar con Meta (${error instanceof Error ? error.message : "error de red"}).`,
        subcode: null,
      });
    }

    deps.log?.({ durationMs: Date.now() - started, method, path, status: response.status });

    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: number; error_subcode?: number; error_user_msg?: string; message?: string };
    } & T;

    if (!response.ok || body.error) {
      throw new MetaApiError({
        code: body.error?.code ?? null,
        httpStatus: response.status,
        message: body.error?.error_user_msg || body.error?.message || `Meta respondió ${response.status}.`,
        subcode: body.error?.error_subcode ?? null,
      });
    }

    return body;
  }

  async function getPageToken() {
    if (!pageToken) {
      const page = await call<{ access_token?: string }>("GET", `/${config.pageId}`, {
        fields: "access_token",
      });

      if (!page.access_token) {
        throw new MetaApiError({
          code: 200,
          httpStatus: 403,
          message: "El token no tiene acceso a la página de Facebook (falta pages_manage_posts o el activo asignado).",
          subcode: null,
        });
      }

      pageToken = page.access_token;
    }

    return pageToken;
  }

  /** Cupo de publicaciones de IG en las últimas 24 h. */
  async function getInstagramPublishingLimit() {
    const result = await call<{
      data?: Array<{ config?: { quota_total?: number }; quota_usage?: number }>;
    }>("GET", `/${config.igUserId}/content_publishing_limit`, {
      fields: "quota_usage,config",
    });
    const row = result.data?.[0];

    return {
      quotaTotal: row?.config?.quota_total ?? null,
      quotaUsage: row?.quota_usage ?? 0,
    };
  }

  async function waitForContainer(containerId: string, options: { attempts: number; intervalMs: number }) {
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      const result = await call<{ status_code?: string }>("GET", `/${containerId}`, {
        fields: "status_code",
      });

      if (result.status_code === "FINISHED") {
        return;
      }

      if (result.status_code === "ERROR" || result.status_code === "EXPIRED") {
        throw new MetaApiError({
          code: null,
          httpStatus: 400,
          message: `Instagram no pudo procesar la imagen (estado ${result.status_code}).`,
          subcode: null,
        });
      }

      await sleep(options.intervalMs);
    }

    throw new MetaApiError({
      code: null,
      httpStatus: 0,
      message: "El contenedor de Instagram no quedó listo a tiempo.",
      subcode: null,
    });
  }

  async function publishInstagram(params: {
    caption: string;
    imageUrls: string[];
    poll?: { attempts: number; intervalMs: number };
  }) {
    const poll = params.poll ?? { attempts: 10, intervalMs: 3_000 };
    let containerId: string;

    if (params.imageUrls.length === 1) {
      const container = await call<{ id: string }>("POST", `/${config.igUserId}/media`, {
        caption: params.caption,
        image_url: params.imageUrls[0],
      });
      containerId = container.id;
    } else {
      const children: string[] = [];

      for (const imageUrl of params.imageUrls) {
        const child = await call<{ id: string }>("POST", `/${config.igUserId}/media`, {
          image_url: imageUrl,
          is_carousel_item: true,
        });
        children.push(child.id);
      }

      for (const child of children) {
        await waitForContainer(child, poll);
      }

      const carousel = await call<{ id: string }>("POST", `/${config.igUserId}/media`, {
        caption: params.caption,
        children: children.join(","),
        media_type: "CAROUSEL",
      });
      containerId = carousel.id;
    }

    await waitForContainer(containerId, poll);

    const published = await call<{ id: string }>("POST", `/${config.igUserId}/media_publish`, {
      creation_id: containerId,
    });
    const media = await call<{ permalink?: string }>("GET", `/${published.id}`, {
      fields: "permalink",
    }).catch(() => ({ permalink: undefined }));

    return { externalId: published.id, permalink: media.permalink ?? null };
  }

  async function publishFacebook(params: {
    caption: string;
    imageUrls: string[];
    linkUrl?: string | null;
  }) {
    const token = await getPageToken();
    let postId: string;

    if (params.imageUrls.length === 0) {
      const post = await call<{ id: string }>(
        "POST",
        `/${config.pageId}/feed`,
        { link: params.linkUrl ?? undefined, message: params.caption },
        token,
      );
      postId = post.id;
    } else if (params.imageUrls.length === 1) {
      const photo = await call<{ id: string; post_id?: string }>(
        "POST",
        `/${config.pageId}/photos`,
        { message: params.caption, url: params.imageUrls[0] },
        token,
      );
      postId = photo.post_id ?? photo.id;
    } else {
      // Varias fotos: se suben sin publicar y se adjuntan a un post del feed.
      const attached: GraphParams = {};

      for (const [index, imageUrl] of params.imageUrls.entries()) {
        const photo = await call<{ id: string }>(
          "POST",
          `/${config.pageId}/photos`,
          { published: false, url: imageUrl },
          token,
        );
        attached[`attached_media[${index}]`] = JSON.stringify({ media_fbid: photo.id });
      }

      const post = await call<{ id: string }>(
        "POST",
        `/${config.pageId}/feed`,
        { ...attached, message: params.caption },
        token,
      );
      postId = post.id;
    }

    const details = await call<{ permalink_url?: string }>(
      "GET",
      `/${postId}`,
      { fields: "permalink_url" },
      token,
    ).catch(() => ({ permalink_url: undefined }));

    return { externalId: postId, permalink: details.permalink_url ?? null };
  }

  return { getInstagramPublishingLimit, publishFacebook, publishInstagram };
}

export type MetaClient = ReturnType<typeof createMetaClient>;
