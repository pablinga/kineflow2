"use client";

import { useEffect, useState } from "react";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { getSupabaseClient } from "@/lib/supabase";

export type AccessLevel = "PAID_ACTIVE" | "TRIAL_ACTIVE" | "READ_ONLY";

type AccessSnapshot = {
  accessLevel: AccessLevel;
  fetchedAt: number;
  loaded: boolean;
  trialDaysRemaining: number | null;
  trialEndsAt: string | null;
  userId: string | null;
  workspaceId: string | null;
};

const ACCESS_SNAPSHOT_MAX_AGE_MS = 15000;
const defaultSnapshot: AccessSnapshot = {
  accessLevel: "TRIAL_ACTIVE",
  fetchedAt: 0,
  loaded: false,
  trialDaysRemaining: null,
  trialEndsAt: null,
  userId: null,
  workspaceId: null,
};

const accessSnapshot: AccessSnapshot = { ...defaultSnapshot };

function normalizeAccessLevel(value: unknown): AccessLevel {
  if (
    value === "PAID_ACTIVE" ||
    value === "TRIAL_ACTIVE" ||
    value === "READ_ONLY"
  ) {
    return value;
  }

  return "TRIAL_ACTIVE";
}

function getTrialDaysRemaining(trialEndsAt: unknown) {
  if (typeof trialEndsAt !== "string" || !trialEndsAt) {
    return null;
  }

  const endsAt = new Date(trialEndsAt).getTime();

  if (Number.isNaN(endsAt)) {
    return null;
  }

  return Math.max(Math.ceil((endsAt - Date.now()) / 86_400_000), 0);
}

export function resetAccessLevelSnapshot() {
  Object.assign(accessSnapshot, defaultSnapshot);
}

export function useAccessLevel() {
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const snapshotFresh =
    Date.now() - accessSnapshot.fetchedAt < ACCESS_SNAPSHOT_MAX_AGE_MS;
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    accessSnapshot.accessLevel,
  );
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(
    accessSnapshot.trialDaysRemaining,
  );
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(
    accessSnapshot.trialEndsAt,
  );
  const [loaded, setLoaded] = useState(
    accessSnapshot.loaded &&
      accessSnapshot.workspaceId === activeWorkspace?.id &&
      snapshotFresh,
  );

  useEffect(() => {
    let mounted = true;

    async function loadAccessLevel() {
      if (!workspaceLoaded) {
        return;
      }

      setLoaded(false);

      try {
        const supabase = getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData.user?.id ?? null;

        if (!userId) {
          return;
        }

        if (
          accessSnapshot.loaded &&
          accessSnapshot.userId === userId &&
          accessSnapshot.workspaceId === (activeWorkspace?.id ?? null) &&
          Date.now() - accessSnapshot.fetchedAt < ACCESS_SNAPSHOT_MAX_AGE_MS
        ) {
          if (mounted) {
            setAccessLevel(accessSnapshot.accessLevel);
            setTrialDaysRemaining(accessSnapshot.trialDaysRemaining);
            setTrialEndsAt(accessSnapshot.trialEndsAt);
          }
          return;
        }

        let accountId = userId;

        if (activeWorkspace?.id) {
          const { data: workspaceData } = await supabase
            .from("workspaces")
            .select("owner_id")
            .eq("id", activeWorkspace.id)
            .maybeSingle();

          accountId =
            ((workspaceData as { owner_id?: string | null } | null)
              ?.owner_id as string | null) ?? userId;
        }

        const [{ data: rpcData }, { data: profileData }] = await Promise.all([
          supabase.rpc("get_account_access_level", {
            target_account_id: accountId,
          }),
          supabase
            .from("profiles")
            .select("trial_ends_at")
            .eq("id", accountId)
            .maybeSingle(),
        ]);
        const nextAccessLevel = normalizeAccessLevel(rpcData);
        const rawTrialEndsAt =
          (profileData as { trial_ends_at?: unknown } | null)?.trial_ends_at;
        const nextTrialDaysRemaining =
          nextAccessLevel === "TRIAL_ACTIVE"
            ? getTrialDaysRemaining(rawTrialEndsAt)
            : null;
        const nextTrialEndsAt =
          nextAccessLevel === "TRIAL_ACTIVE" && typeof rawTrialEndsAt === "string"
            ? rawTrialEndsAt
            : null;

        accessSnapshot.accessLevel = nextAccessLevel;
        accessSnapshot.fetchedAt = Date.now();
        accessSnapshot.loaded = true;
        accessSnapshot.trialDaysRemaining = nextTrialDaysRemaining;
        accessSnapshot.trialEndsAt = nextTrialEndsAt;
        accessSnapshot.userId = userId;
        accessSnapshot.workspaceId = activeWorkspace?.id ?? null;

        if (mounted) {
          setAccessLevel(nextAccessLevel);
          setTrialDaysRemaining(nextTrialDaysRemaining);
          setTrialEndsAt(nextTrialEndsAt);
        }
      } finally {
        if (mounted) {
          setLoaded(true);
        }
      }
    }

    loadAccessLevel();

    return () => {
      mounted = false;
    };
  }, [activeWorkspace?.id, workspaceLoaded]);

  return {
    accessLevel,
    isReadOnly: accessLevel === "READ_ONLY",
    loaded,
    trialDaysRemaining,
    trialEndsAt,
  };
}
