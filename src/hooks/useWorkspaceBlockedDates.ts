"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

export type WorkspaceBlockedDate = {
  blockedDate: string;
  id: string;
  reason: string;
};

type WorkspaceBlockedDateRow = {
  blocked_date: string;
  id: string;
  reason: string | null;
};

function mapBlockedDate(row: WorkspaceBlockedDateRow): WorkspaceBlockedDate {
  return {
    blockedDate: row.blocked_date,
    id: row.id,
    reason: row.reason ?? "",
  };
}

export function useWorkspaceBlockedDates() {
  const { activeWorkspace, loaded: activeWorkspaceLoaded } = useActiveWorkspace();
  const [blockedDates, setBlockedDates] = useState<WorkspaceBlockedDate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadBlockedDates = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      if (!activeWorkspace?.id) {
        setBlockedDates([]);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("workspace_blocked_dates")
        .select("id, blocked_date, reason")
        .eq("workspace_id", activeWorkspace.id)
        .order("blocked_date", { ascending: true });

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setBlockedDates(
        ((data ?? []) as WorkspaceBlockedDateRow[]).map(mapBlockedDate),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar los dias bloqueados.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, activeWorkspaceLoaded]);

  useEffect(() => {
    loadBlockedDates();
  }, [loadBlockedDates]);

  async function addBlockedDate(blockedDate: string, reason: string) {
    if (!activeWorkspace?.id || !blockedDate) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error: insertError } = await supabase
      .from("workspace_blocked_dates")
      .insert({
        blocked_date: blockedDate,
        reason: reason.trim() || null,
        workspace_id: activeWorkspace.id,
      });

    if (insertError) {
      throw new Error(mapSupabaseError(insertError));
    }

    await loadBlockedDates();
  }

  async function deleteBlockedDate(id: string) {
    if (!activeWorkspace?.id) {
      return;
    }

    const supabase = getSupabaseClient();
    const { error: deleteError } = await supabase
      .from("workspace_blocked_dates")
      .delete()
      .eq("workspace_id", activeWorkspace.id)
      .eq("id", id);

    if (deleteError) {
      throw new Error(mapSupabaseError(deleteError));
    }

    await loadBlockedDates();
  }

  return {
    addBlockedDate,
    blockedDates,
    deleteBlockedDate,
    error,
    loaded,
    refreshBlockedDates: loadBlockedDates,
  };
}
