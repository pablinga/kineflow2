import "server-only";

import { cache } from "react";
import { getPublicProfileView, getWorkspace } from "@/lib/public-booking";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase-server";

// Carga del perfil público compartida por la página y su imagen para
// compartir (opengraph-image.tsx).

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Perfil público del espacio. Si no se puede cargar (link inválido, base
 * caída) devuelve null y la página muestra solo la reserva, como antes.
 * cache() evita leerlo dos veces (metadatos y página).
 */
export const loadProfile = cache(async (workspaceId: string) => {
  if (!UUID_PATTERN.test(workspaceId)) {
    return null;
  }

  const admin = getSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  try {
    const workspace = await getWorkspace(admin, workspaceId);

    return workspace
      ? await getPublicProfileView(admin, getSupabaseServerClient(), workspace)
      : null;
  } catch (error) {
    console.error("[public-profile] load failed", {
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
});
