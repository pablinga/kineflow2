import "server-only";

import { publisherNotifier } from "./notify";
import type { PublisherDeps } from "./publisher.ts";
import { createLiveMetaClient, createPublisherRepo, getPublishMode } from "./server.ts";

/** Dependencias reales del publicador. En dry_run no se crea el cliente de Meta. */
export function buildPublisherDeps(): PublisherDeps {
  const mode = getPublishMode();

  return {
    log: (message, details) => console.info(`[content] ${message}`, details ?? {}),
    meta: mode === "live" ? createLiveMetaClient() : null,
    mode,
    notify: publisherNotifier,
    now: () => new Date(),
    repo: createPublisherRepo(),
  };
}
