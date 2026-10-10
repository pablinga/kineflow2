"use client";

import { useCallback, useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import type { DashboardHomeStats } from "@/lib/dashboard-home";
import { toArgentinaDateValue } from "@/lib/dates";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";
import { getSupabaseClient } from "@/lib/supabase";

/** Límites del mes en hora de Argentina (UTC-3, sin horario de verano). */
function getArgentinaMonthRange(now: Date) {
  const [year, month] = toArgentinaDateValue(now).split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (value: number) => String(value).padStart(2, "0");

  return {
    from: `${year}-${pad(month)}-01T00:00:00-03:00`,
    to: `${nextYear}-${pad(nextMonth)}-01T00:00:00-03:00`,
  };
}

/**
 * Indicadores del Inicio. Todo se agrega en la base (RPC get_dashboard_home,
 * SECURITY INVOKER: respeta las RLS); al cliente solo llegan números.
 */
export function useDashboardHome(enabled: boolean) {
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [stats, setStats] = useState<DashboardHomeStats | null>(null);
  const [remindersSent, setRemindersSent] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const workspaceId = activeWorkspace?.id ?? null;

  const load = useCallback(async () => {
    if (!enabled || !workspaceLoaded || !workspaceId) {
      return;
    }

    setError("");

    try {
      const supabase = getSupabaseClient();
      const range = getArgentinaMonthRange(new Date());
      const [statsResult, remindersResult] = await Promise.all([
        supabase.rpc("get_dashboard_home", { p_workspace_id: workspaceId }),
        supabase.rpc("get_dashboard_reminders_sent", {
          p_from: range.from,
          p_to: range.to,
          p_workspace_id: workspaceId,
        }),
      ]);

      if (statsResult.error) {
        throw new Error(mapSupabaseError(statsResult.error));
      }

      setStats((statsResult.data as DashboardHomeStats | null) ?? null);
      // Sin permiso o sin logs: el dato se oculta, no se inventa.
      setRemindersSent(
        remindersResult.error || remindersResult.data === null
          ? null
          : Number(remindersResult.data),
      );
    } catch (loadError) {
      setError(
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar los indicadores del Inicio.",
        ),
      );
    } finally {
      setLoaded(true);
    }
  }, [enabled, workspaceId, workspaceLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  return { error, loaded, reload: load, remindersSent, stats };
}
