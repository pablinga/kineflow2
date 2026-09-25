"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

export type ArtProvider = {
  active: boolean;
  id: string;
  name: string;
  /** Precio por sesión; null = sin precio cargado. */
  sessionPrice: number | null;
};

type ArtProviderRow = {
  active: boolean;
  id: string;
  name: string;
  session_price: number | string | null;
};

function mapArtProvider(row: ArtProviderRow): ArtProvider {
  return {
    active: row.active,
    id: row.id,
    name: row.name,
    // numeric de Postgres puede llegar como string.
    sessionPrice: row.session_price === null ? null : Number(row.session_price),
  };
}

export function useArtProviders() {
  const { activeWorkspace, loaded: activeWorkspaceLoaded } = useActiveWorkspace();
  const [providers, setProviders] = useState<ArtProvider[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadProviders = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      if (!activeWorkspace?.id) {
        setProviders([]);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("art_providers")
        .select("id, name, active, session_price")
        .eq("workspace_id", activeWorkspace.id)
        .order("name", { ascending: true });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setProviders(((data ?? []) as ArtProviderRow[]).map(mapArtProvider));
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar las ART.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, activeWorkspaceLoaded]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  async function addProvider(name: string, sessionPrice: number | null = null) {
    const normalizedName = name.trim();

    if (!activeWorkspace?.id || !normalizedName) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error: insertError } = await supabase
      .from("art_providers")
      .insert({
        active: true,
        name: normalizedName,
        session_price: sessionPrice,
        workspace_id: activeWorkspace.id,
      });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadProviders();
  }

  async function updateProvider(id: string, input: Partial<ArtProvider>) {
    if (!activeWorkspace?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("art_providers")
      .update({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.sessionPrice !== undefined
          ? { session_price: input.sessionPrice }
          : {}),
      })
      .eq("workspace_id", activeWorkspace.id)
      .eq("id", id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await loadProviders();
  }

  async function deleteProvider(id: string) {
    if (!activeWorkspace?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error: deleteError } = await supabase
      .from("art_providers")
      .delete()
      .eq("workspace_id", activeWorkspace.id)
      .eq("id", id);

    if (deleteError) {
      throw new Error(mapSupabaseError(deleteError));
    }

    await loadProviders();
  }

  return {
    addProvider,
    deleteProvider,
    error,
    loaded,
    providers,
    refreshProviders: loadProviders,
    updateProvider,
  };
}
