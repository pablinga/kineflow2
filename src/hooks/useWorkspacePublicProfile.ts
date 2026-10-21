"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { mapSupabaseError } from "@/lib/error-messages";
import {
  EMPTY_PROFILE_FIELDS,
  type ProfileLocality,
  type PublicProfileFields,
  normalizeProfileFields,
} from "@/lib/public-profile";
import { getSupabaseClient } from "@/lib/supabase";

type LocalityEmbed = {
  display_name: string;
  label: string;
  name: string;
  province_name: string;
};

type ProfileRow = {
  ar_localities: LocalityEmbed | LocalityEmbed[] | null;
  bio: string | null;
  home_visits: boolean;
  insurance_notes: string | null;
  license_number: string | null;
  listed_in_directory: boolean;
  locality_id: string | null;
  public_address: string | null;
  treatments: string[] | null;
};

/** Localidad elegida, con el texto de la lista para mostrar en el campo. */
export type SelectedLocality = ProfileLocality & { id: string; label: string };

const PROFILE_COLUMNS =
  "treatments, insurance_notes, home_visits, bio, public_address, locality_id, license_number, listed_in_directory, ar_localities(name, display_name, province_name, label)";

function fromRow(row: ProfileRow) {
  return normalizeProfileFields({
    bio: row.bio,
    homeVisits: row.home_visits,
    insuranceNotes: row.insurance_notes,
    licenseNumber: row.license_number,
    localityId: row.locality_id,
    publicAddress: row.public_address,
    treatments: row.treatments,
  });
}

function localityFromRow(row: ProfileRow): SelectedLocality | null {
  const embed = Array.isArray(row.ar_localities) ? row.ar_localities[0] : row.ar_localities;

  return row.locality_id && embed
    ? {
        displayName: embed.display_name,
        id: row.locality_id,
        label: embed.label,
        name: embed.name,
        province: embed.province_name,
      }
    : null;
}

/**
 * Perfil público del espacio activo (workspace_public_profiles). Solo el dueño
 * del espacio lo lee y lo edita (RLS). Si todavía no existe, se precarga con
 * la dirección del espacio y la matrícula del profesional, sin guardar nada.
 */
export function useWorkspacePublicProfile() {
  const { user } = useRequireAuth();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [fields, setFields] = useState<PublicProfileFields>(EMPTY_PROFILE_FIELDS);
  const [listedInDirectory, setListedInDirectory] = useState(false);
  const [locality, setLocality] = useState<SelectedLocality | null>(null);
  const [exists, setExists] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const workspaceId = activeWorkspace?.id ?? "";
  const userId = user?.id ?? "";
  const isOwner = Boolean(userId && activeWorkspace?.ownerId === userId);

  useEffect(() => {
    if (!workspaceLoaded || !workspaceId || !userId) {
      return;
    }

    let cancelled = false;

    async function load() {
      setLoaded(false);
      setError("");

      try {
        const supabase = getSupabaseClient();
        const [profileResult, ownerResult, workspaceResult] = await Promise.all([
          supabase
            .from("workspace_public_profiles")
            .select(PROFILE_COLUMNS)
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("full_name, license_number")
            .eq("id", userId)
            .maybeSingle(),
          supabase.from("workspaces").select("address").eq("id", workspaceId).maybeSingle(),
        ]);

        if (profileResult.error) {
          throw new Error(mapSupabaseError(profileResult.error));
        }

        if (cancelled) {
          return;
        }

        const owner = ownerResult.data as { full_name: string | null; license_number: string | null } | null;
        const row = profileResult.data as ProfileRow | null;
        setOwnerName(owner?.full_name?.trim() ?? "");
        setExists(Boolean(row));
        setListedInDirectory(row?.listed_in_directory ?? false);
        setLocality(row ? localityFromRow(row) : null);
        setFields(
          row
            ? fromRow(row)
            : normalizeProfileFields({
                licenseNumber: owner?.license_number,
                publicAddress: (workspaceResult.data as { address: string | null } | null)?.address,
              }),
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "No pudimos cargar el perfil.");
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, workspaceId, workspaceLoaded]);

  const save = useCallback(
    async (next: PublicProfileFields, nextListed: boolean) => {
      if (!workspaceId) {
        throw new Error("No encontramos un espacio de trabajo activo.");
      }

      const normalized = normalizeProfileFields(next);
      const { data, error: saveError } = await getSupabaseClient()
        .from("workspace_public_profiles")
        .upsert(
          {
            bio: normalized.bio || null,
            city: null,
            home_visits: normalized.homeVisits,
            insurance_notes: normalized.insuranceNotes || null,
            license_number: normalized.licenseNumber || null,
            locality_id: normalized.localityId || null,
            listed_in_directory: nextListed,
            public_address: normalized.publicAddress || null,
            treatments: normalized.treatments,
            workspace_id: workspaceId,
          },
          { onConflict: "workspace_id" },
        )
        .select(PROFILE_COLUMNS)
        .single();

      if (saveError) {
        throw new Error(mapSupabaseError(saveError));
      }

      const row = data as ProfileRow;
      setFields(fromRow(row));
      setListedInDirectory(row.listed_in_directory);
      setLocality(localityFromRow(row));
      setExists(true);
    },
    [workspaceId],
  );

  return {
    error,
    exists,
    fields,
    isOwner,
    listedInDirectory,
    loaded,
    locality,
    ownerName,
    save,
  };
}
