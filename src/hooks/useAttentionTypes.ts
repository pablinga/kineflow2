"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

/**
 * Catálogo de "Tipos de atención" del workspace (RPG, ATM, ...). No confundir
 * con useTreatments (plan de tratamiento del paciente).
 */
export type AttentionType = {
  active: boolean;
  allowsSimultaneous: boolean;
  durationMinutes: number;
  id: string;
  name: string;
  /** null = sin precio cargado. */
  price: number | null;
  sortOrder: number;
};

export type AttentionTypeInput = {
  allowsSimultaneous: boolean;
  durationMinutes: number;
  name: string;
  price: number | null;
  sortOrder?: number;
};

type AttentionTypeRow = {
  active: boolean;
  allows_simultaneous: boolean;
  duration_minutes: number;
  id: string;
  name: string;
  price: number | string | null;
  sort_order: number;
};

const DUPLICATE_NAME_MESSAGE = "Ya existe un tipo de atención activo con ese nombre.";

function mapAttentionType(row: AttentionTypeRow): AttentionType {
  return {
    active: row.active,
    allowsSimultaneous: row.allows_simultaneous,
    durationMinutes: row.duration_minutes,
    id: row.id,
    name: row.name,
    // numeric de Postgres puede llegar como string.
    price: row.price === null ? null : Number(row.price),
    sortOrder: row.sort_order,
  };
}

function toWriteError(error: { code?: string; message?: string }) {
  return new Error(error.code === "23505" ? DUPLICATE_NAME_MESSAGE : mapSupabaseError(error));
}

export function useAttentionTypes(options: { includeInactive?: boolean } = {}) {
  const { activeWorkspace, loaded: activeWorkspaceLoaded } = useActiveWorkspace();
  const [attentionTypes, setAttentionTypes] = useState<AttentionType[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const includeInactive = options.includeInactive ?? false;

  const loadAttentionTypes = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      if (!activeWorkspace?.id) {
        setAttentionTypes([]);
        return;
      }

      let query = getSupabaseClient()
        .from("attention_types")
        .select("id, name, duration_minutes, price, allows_simultaneous, active, sort_order")
        .eq("workspace_id", activeWorkspace.id)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (!includeInactive) {
        query = query.eq("active", true);
      }

      const { data, error: queryError } = await query;

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setAttentionTypes(((data ?? []) as AttentionTypeRow[]).map(mapAttentionType));
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(loadError, "No pudimos cargar los tipos de atención."),
      );
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, activeWorkspaceLoaded, includeInactive]);

  useEffect(() => {
    void loadAttentionTypes();
  }, [loadAttentionTypes]);

  async function addAttentionType(input: AttentionTypeInput) {
    const name = input.name.trim();

    if (!activeWorkspace?.id || !name) {
      return;
    }

    const { error: insertError } = await getSupabaseClient()
      .from("attention_types")
      .insert({
        active: true,
        allows_simultaneous: input.allowsSimultaneous,
        duration_minutes: input.durationMinutes,
        name,
        price: input.price,
        sort_order: input.sortOrder ?? 0,
        workspace_id: activeWorkspace.id,
      });

    if (insertError) {
      throw toWriteError(insertError);
    }

    await loadAttentionTypes();
  }

  async function updateAttentionType(id: string, input: Partial<AttentionTypeInput>) {
    if (!activeWorkspace?.id) {
      return;
    }

    const { error: updateError } = await getSupabaseClient()
      .from("attention_types")
      .update({
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.durationMinutes !== undefined
          ? { duration_minutes: input.durationMinutes }
          : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.allowsSimultaneous !== undefined
          ? { allows_simultaneous: input.allowsSimultaneous }
          : {}),
        ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
      })
      .eq("workspace_id", activeWorkspace.id)
      .eq("id", id);

    if (updateError) {
      throw toWriteError(updateError);
    }

    await loadAttentionTypes();
  }

  async function setAttentionTypeActive(id: string, active: boolean) {
    if (!activeWorkspace?.id) {
      return;
    }

    const { error: updateError } = await getSupabaseClient()
      .from("attention_types")
      .update({ active })
      .eq("workspace_id", activeWorkspace.id)
      .eq("id", id);

    if (updateError) {
      throw toWriteError(updateError);
    }

    await loadAttentionTypes();
  }

  return {
    addAttentionType,
    attentionTypes,
    error,
    loaded,
    refreshAttentionTypes: loadAttentionTypes,
    setAttentionTypeActive,
    updateAttentionType,
  };
}
