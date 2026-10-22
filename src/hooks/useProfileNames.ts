"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Nombres completos de varios perfiles en una sola consulta (para mostrar
 * quién atiende o quién registró algo). La RLS decide qué perfiles se ven:
 * el propio y, para el staff de una clínica, los de su equipo. Los que no se
 * pueden leer simplemente no están en el mapa.
 */
export function useProfileNames(ids: Array<string | null | undefined>) {
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const key = Array.from(new Set(ids.filter((id): id is string => Boolean(id))))
    .sort()
    .join(",");

  useEffect(() => {
    if (!key) {
      setNames(new Map());
      return;
    }

    let cancelled = false;

    void getSupabaseClient()
      .from("profiles")
      .select("id, full_name")
      .in("id", key.split(","))
      .then(({ data }) => {
        if (cancelled) {
          return;
        }

        setNames(
          new Map(
            ((data ?? []) as Array<{ full_name: string | null; id: string }>)
              .filter((row) => row.full_name?.trim())
              .map((row) => [row.id, row.full_name!.trim()]),
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
