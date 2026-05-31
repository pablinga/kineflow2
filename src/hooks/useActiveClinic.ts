"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";

export type ActiveClinic = {
  id: string;
  name: string;
};

const activeClinicSnapshot: {
  clinic: ActiveClinic | null;
  error: string;
  loaded: boolean;
  userId: string | null;
} = {
  clinic: null,
  error: "",
  loaded: false,
  userId: null,
};

type ClinicRow = {
  id: string;
  name: string;
};

export function useActiveClinic(enabled: boolean) {
  const [clinic, setClinic] = useState<ActiveClinic | null>(
    activeClinicSnapshot.clinic,
  );
  const [error, setError] = useState(activeClinicSnapshot.error);
  const [loaded, setLoaded] = useState(!enabled || activeClinicSnapshot.loaded);

  const loadClinic = useCallback(async () => {
    if (!enabled) {
      setClinic(null);
      setError("");
      setLoaded(true);
      return;
    }

    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar la cuenta del consultorio.");
      }

      if (
        activeClinicSnapshot.loaded &&
        activeClinicSnapshot.userId === sessionData.user.id
      ) {
        setClinic(activeClinicSnapshot.clinic);
        setError(activeClinicSnapshot.error);
        setLoaded(true);
        return;
      }

      const { data, error: queryError } = await supabase
        .from("clinics")
        .select("id, name")
        .eq("owner_id", sessionData.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (queryError) {
        throw new Error(mapSupabaseError(queryError));
      }

      const row = data as ClinicRow | null;
      const nextClinic = row ? { id: row.id, name: row.name } : null;
      const nextError = nextClinic
        ? ""
        : "No encontramos un consultorio asociado a tu usuario.";

      activeClinicSnapshot.clinic = nextClinic;
      activeClinicSnapshot.error = nextError;
      activeClinicSnapshot.loaded = true;
      activeClinicSnapshot.userId = sessionData.user.id;

      setClinic(nextClinic);
      setError(nextError);
    } catch (loadError) {
      const nextError =
        getFriendlyErrorMessage(
          loadError,
          "No pudimos cargar el consultorio asociado.",
        );

      activeClinicSnapshot.clinic = null;
      activeClinicSnapshot.error = nextError;
      activeClinicSnapshot.loaded = true;
      setClinic(null);
      setError(nextError);
    } finally {
      setLoaded(true);
    }
  }, [enabled]);

  useEffect(() => {
    loadClinic();
  }, [loadClinic]);

  return {
    clinic,
    error,
    loaded,
    refreshClinic: loadClinic,
  };
}
