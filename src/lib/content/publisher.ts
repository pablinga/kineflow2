// Corrida del publicador (cron cada 15 min). Sin dependencias de Next ni de
// Supabase: el repositorio, el cliente de Meta y los avisos se inyectan, así
// se prueba con todo simulado.

import { MetaApiError, type MetaClient } from "./meta-graph.ts";
import {
  composeCaption,
  MAX_PUBLISH_ATTEMPTS,
  retryDelayMinutes,
  type ContentChannel,
  type ContentFormat,
  type ContentStatus,
} from "./rules.ts";

export type PublishMode = "live" | "dry_run";

export type QueuedPost = {
  attempts: number;
  campaign: string;
  caption: string;
  channel: ContentChannel;
  format: ContentFormat;
  hashtags: string[];
  id: string;
  image_paths: string[];
  link_url: string | null;
  next_attempt_at: string | null;
  scheduled_at: string;
  status: ContentStatus;
};

export type PublisherRepo = {
  /** approved, scheduled_at <= now y next_attempt_at vencido. */
  listDue(now: Date): Promise<QueuedPost[]>;
  /**
   * approved -> publishing con un update condicional
   * (`where id = ? and status = 'approved'`). Devuelve false si otra
   * corrida ya lo tomó: así nunca se publica dos veces.
   */
  claim(id: string): Promise<boolean>;
  markPublished(
    id: string,
    result: { externalId: string | null; permalink: string | null; status: "published" | "published_dry_run" },
  ): Promise<void>;
  /** publishing -> approved con next_attempt_at (reintento o reprogramación). */
  release(id: string, params: { attempts: number; error: string; nextAttemptAt: string }): Promise<void>;
  markFailed(id: string, params: { attempts: number; error: string }): Promise<void>;
  /** URLs firmadas cortas de las imágenes del bucket privado. */
  signImageUrls(paths: string[]): Promise<string[]>;
};

export type PublisherNotifier = {
  failed(post: QueuedPost, error: string): Promise<void>;
  tokenProblem(post: QueuedPost, error: string): Promise<void>;
};

export type PublisherDeps = {
  log: (message: string, details?: Record<string, unknown>) => void;
  meta: MetaClient | null;
  mode: PublishMode;
  notify: PublisherNotifier;
  now: () => Date;
  repo: PublisherRepo;
};

export type PublishOutcome =
  | "published"
  | "published_dry_run"
  | "skipped_claimed"
  | "rescheduled_limit"
  | "retry"
  | "failed"
  | "failed_auth";

/** El modo live solo se activa con META_PUBLISH_MODE=live explícito. */
export function resolvePublishMode(value: string | undefined): PublishMode {
  return value?.trim() === "live" ? "live" : "dry_run";
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

export async function publishOne(post: QueuedPost, deps: PublisherDeps): Promise<PublishOutcome> {
  const claimed = await deps.repo.claim(post.id);

  if (!claimed) {
    return "skipped_claimed";
  }

  const caption = composeCaption({
    caption: post.caption,
    channel: post.channel,
    hashtags: post.hashtags,
    linkUrl: post.link_url,
  });

  if (deps.mode === "dry_run" || !deps.meta) {
    deps.log("content_publish_dry_run", {
      caption,
      channel: post.channel,
      format: post.format,
      id: post.id,
      images: post.image_paths,
    });
    await deps.repo.markPublished(post.id, {
      externalId: null,
      permalink: null,
      status: "published_dry_run",
    });

    return "published_dry_run";
  }

  const attempts = post.attempts + 1;

  try {
    const imageUrls = await deps.repo.signImageUrls(post.image_paths);
    let result: { externalId: string; permalink: string | null };

    if (post.channel === "instagram") {
      const limit = await deps.meta.getInstagramPublishingLimit();

      if (limit.quotaTotal !== null && limit.quotaUsage >= limit.quotaTotal) {
        // Sin cupo: no cuenta como intento, se reprograma 1 hora.
        await deps.repo.release(post.id, {
          attempts: post.attempts,
          error: `Sin cupo de publicación en Instagram (${limit.quotaUsage}/${limit.quotaTotal} en 24 h). Reprogramado.`,
          nextAttemptAt: addMinutes(deps.now(), 60),
        });

        return "rescheduled_limit";
      }

      result = await deps.meta.publishInstagram({ caption, imageUrls });
    } else {
      result = await deps.meta.publishFacebook({ caption, imageUrls, linkUrl: post.link_url });
    }

    await deps.repo.markPublished(post.id, { ...result, status: "published" });

    return "published";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al publicar.";
    const kind = error instanceof MetaApiError ? error.kind : "transient";

    if (kind === "auth") {
      await deps.repo.markFailed(post.id, { attempts, error: `Token o permisos de Meta: ${message}` });
      await deps.notify.tokenProblem(post, message);

      return "failed_auth";
    }

    if (kind === "rate_limit") {
      await deps.repo.release(post.id, {
        attempts: post.attempts,
        error: `Límite de Meta: ${message}. Reprogramado.`,
        nextAttemptAt: addMinutes(deps.now(), 60),
      });

      return "rescheduled_limit";
    }

    if (attempts >= MAX_PUBLISH_ATTEMPTS) {
      await deps.repo.markFailed(post.id, { attempts, error: message });
      await deps.notify.failed(post, message);

      return "failed";
    }

    await deps.repo.release(post.id, {
      attempts,
      error: message,
      nextAttemptAt: addMinutes(deps.now(), retryDelayMinutes(attempts)),
    });

    return "retry";
  }
}

export async function runPublisher(deps: PublisherDeps) {
  const due = await deps.repo.listDue(deps.now());
  const results: Array<{ id: string; outcome: PublishOutcome }> = [];

  // De a uno: el volumen es chico y así no se pisan los límites de Meta.
  for (const post of due) {
    results.push({ id: post.id, outcome: await publishOne(post, deps) });
  }

  return results;
}
