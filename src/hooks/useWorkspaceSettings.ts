"use client";

import { useCallback, useEffect, useState } from "react";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

export type WorkspaceSettings = {
  address: string;
  color: string;
  defaultSessionDurationMinutes: number | null;
  defaultSessionPrice: number | null;
  email: string;
  maxSimultaneousAppointments: number;
  name: string;
  phone: string;
};

type WorkspaceSettingsRow = {
  address: string | null;
  color: string | null;
  default_session_duration_minutes: number | null;
  default_session_price: number | null;
  email: string | null;
  max_simultaneous_appointments: number;
  name: string;
  phone: string | null;
};

export const WORKSPACE_COLOR_OPTIONS = [
  "#0b97dc",
  "#14b8a6",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#f97316",
  "#16a34a",
  "#475569",
];

function mapWorkspaceSettings(row: WorkspaceSettingsRow): WorkspaceSettings {
  return {
    address: row.address ?? "",
    color: row.color ?? WORKSPACE_COLOR_OPTIONS[0],
    defaultSessionDurationMinutes: row.default_session_duration_minutes,
    defaultSessionPrice: row.default_session_price,
    email: row.email ?? "",
    maxSimultaneousAppointments: row.max_simultaneous_appointments ?? 1,
    name: row.name,
    phone: row.phone ?? "",
  };
}

export function useWorkspaceSettings() {
  const {
    activeWorkspace,
    loaded: activeWorkspaceLoaded,
    refreshWorkspaces,
  } = useActiveWorkspace();
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  const loadSettings = useCallback(async () => {
    if (!activeWorkspaceLoaded) {
      return;
    }

    setLoaded(false);
    setError("");

    try {
      if (!activeWorkspace?.id) {
        setSettings(null);
        return;
      }

      const supabase = getSupabaseClient();
      const { data, error: queryError } = await supabase
        .from("workspaces")
        .select(
          "name, address, phone, email, color, default_session_price, default_session_duration_minutes, max_simultaneous_appointments",
        )
        .eq("id", activeWorkspace.id)
        .maybeSingle();

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      setSettings(data ? mapWorkspaceSettings(data as WorkspaceSettingsRow) : null);
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar la configuracion del espacio.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [activeWorkspace?.id, activeWorkspaceLoaded]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function updateSettings(input: WorkspaceSettings) {
    setError("");

    if (!activeWorkspace?.id) {
      throw new Error("No encontramos un espacio activo.");
    }

    const supabase = getSupabaseClient();
    const { error: updateError } = await supabase
      .from("workspaces")
      .update({
        address: input.address.trim() || null,
        color: input.color,
        default_session_duration_minutes:
          input.defaultSessionDurationMinutes ?? null,
        default_session_price: input.defaultSessionPrice ?? null,
        email: input.email.trim().toLowerCase() || null,
        max_simultaneous_appointments: input.maxSimultaneousAppointments,
        name: input.name.trim(),
        phone: input.phone.trim() || null,
      })
      .eq("id", activeWorkspace.id);

    if (updateError) {
      throw new Error(mapSupabaseError(updateError));
    }

    await Promise.all([loadSettings(), refreshWorkspaces()]);
  }

  return {
    error,
    loaded,
    refreshSettings: loadSettings,
    settings,
    updateSettings,
  };
}
