import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LlmsTxtProfile } from "@/lib/llms-txt";
import {
  getLocalityText,
  getProfileDisplayName,
  isProfileEmpty,
  normalizeTreatments,
  treatmentLabel,
} from "@/lib/public-profile";

// Perfiles públicos para el sitemap y /llms.txt. Solo columnas del perfil y
// del espacio que ya son públicas en /reservar/[workspaceId].

const MAX_PROFILES = 5000;

type Embedded<T> = T | T[] | null;

function first<T>(value: Embedded<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

type ProfileRow = {
  bio: string | null;
  home_visits: boolean;
  treatments: string[] | null;
  updated_at: string;
  workspace_id: string;
};

/** Perfiles con contenido (los vacíos tienen noindex): para el sitemap. */
export async function listIndexableProfiles(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("workspace_public_profiles")
    .select("workspace_id, bio, treatments, home_visits, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_PROFILES);

  if (error) {
    throw new Error("No pudimos cargar los perfiles públicos.");
  }

  return ((data ?? []) as ProfileRow[])
    .filter((row) =>
      !isProfileEmpty({ bio: row.bio ?? "", treatments: normalizeTreatments(row.treatments) }),
    )
    .map((row) => ({ updatedAt: row.updated_at, workspaceId: row.workspace_id }));
}

type DirectoryRow = ProfileRow & {
  ar_localities: Embedded<{ display_name: string; name: string; province_name: string }>;
  workspaces: Embedded<{ name: string; owner_id: string | null; type: "PERSONAL" | "CLINICA" }>;
};

/**
 * Perfiles que aceptaron aparecer en el buscador de KineFlow
 * (listed_in_directory) y tienen contenido: para /llms.txt.
 */
export async function listDirectoryProfiles(
  admin: SupabaseClient,
  siteUrl: string,
): Promise<LlmsTxtProfile[]> {
  const { data, error } = await admin
    .from("workspace_public_profiles")
    .select(
      "workspace_id, bio, treatments, home_visits, updated_at, ar_localities(name, display_name, province_name), workspaces(name, type, owner_id)",
    )
    .eq("listed_in_directory", true)
    .limit(MAX_PROFILES);

  if (error) {
    throw new Error("No pudimos cargar el directorio.");
  }

  const rows = ((data ?? []) as DirectoryRow[]).filter((row) =>
    !isProfileEmpty({ bio: row.bio ?? "", treatments: normalizeTreatments(row.treatments) }),
  );
  const ownerIds = rows
    .map((row) => first(row.workspaces))
    .filter((workspace) => workspace?.type === "PERSONAL" && workspace.owner_id)
    .map((workspace) => workspace!.owner_id as string);
  const names = new Map<string, string>();

  if (ownerIds.length > 0) {
    const { data: owners } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", ownerIds);

    for (const owner of (owners ?? []) as Array<{ full_name: string | null; id: string }>) {
      if (owner.full_name?.trim()) {
        names.set(owner.id, owner.full_name.trim());
      }
    }
  }

  const base = siteUrl.replace(/\/$/, "");

  return rows
    .map((row) => {
      const workspace = first(row.workspaces);
      const locality = first(row.ar_localities);
      const type = workspace?.type ?? "PERSONAL";
      const rawName =
        type === "PERSONAL" && workspace?.owner_id
          ? names.get(workspace.owner_id) ?? workspace.name
          : workspace?.name ?? "";

      return {
        homeVisits: row.home_visits,
        locality: getLocalityText(
          locality
            ? { displayName: locality.display_name, name: locality.name, province: locality.province_name }
            : null,
        ),
        name: getProfileDisplayName({ name: rawName, type }),
        treatments: normalizeTreatments(row.treatments).map(treatmentLabel),
        type,
        url: `${base}/reservar/${row.workspace_id}`,
      };
    })
    .filter((profile) => profile.name.trim())
    .sort((left, right) => left.name.localeCompare(right.name, "es"));
}
