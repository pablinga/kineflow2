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
  accessRequest = null;
}

type AccessResult = Pick<
  AccessSnapshot,
  "accessLevel" | "trialDaysRemaining" | "trialEndsAt"
>;

// Consulta en curso compartida: el sidebar y la página montan este hook a la
// vez, y sin esto cada uno disparaba su propia cadena de requests.
let accessRequest: { key: string; promise: Promise<AccessResult> } | null = null;

async function fetchAccessLevel(accountId: string): Promise<AccessResult> {
  const supabase = getSupabaseClient();
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
  const accessLevel = normalizeAccessLevel(rpcData);
  const rawTrialEndsAt =
    (profileData as { trial_ends_at?: unknown } | null)?.trial_ends_at;

  return {
    accessLevel,
    trialDaysRemaining:
      accessLevel === "TRIAL_ACTIVE" ? getTrialDaysRemaining(rawTrialEndsAt) : null,
    trialEndsAt:
      accessLevel === "TRIAL_ACTIVE" && typeof rawTrialEndsAt === "string"
        ? rawTrialEndsAt
        : null,
  };
}

async function resolveAccountId(
  userId: string,
  workspaceId: string | null,
  workspaceOwnerId: string | null,
) {
  if (!workspaceId) {
    return userId;
  }

  if (workspaceOwnerId) {
    return workspaceOwnerId;
  }

  const { data: workspaceData } = await getSupabaseClient()
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();

  return (
    ((workspaceData as { owner_id?: string | null } | null)?.owner_id as
      | string
      | null) ?? userId
  );
}

function isSnapshotFresh(userId: string | null, workspaceId: string | null) {
  return (
    accessSnapshot.loaded &&
    (userId === null || accessSnapshot.userId === userId) &&
    accessSnapshot.workspaceId === workspaceId &&
    Date.now() - accessSnapshot.fetchedAt < ACCESS_SNAPSHOT_MAX_AGE_MS
  );
}

export function useAccessLevel() {
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? null;
  const workspaceOwnerId = activeWorkspace?.ownerId ?? null;
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(
    accessSnapshot.accessLevel,
  );
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(
    accessSnapshot.trialDaysRemaining,
  );
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(
    accessSnapshot.trialEndsAt,
  );
  const [loaded, setLoaded] = useState(isSnapshotFresh(null, workspaceId));

  useEffect(() => {
    let mounted = true;

    function apply(result: AccessResult) {
      if (!mounted) {
        return;
      }

      setAccessLevel(result.accessLevel);
      setTrialDaysRemaining(result.trialDaysRemaining);
      setTrialEndsAt(result.trialEndsAt);
    }

    async function loadAccessLevel() {
      if (!workspaceLoaded) {
        return;
      }

      try {
        // getSession lee la sesión local; getUser hacía un round-trip al
        // servidor solo para obtener el id. La RLS valida igual cada consulta.
        const { data: sessionData } = await getSupabaseClient().auth.getSession();
        const userId = sessionData.session?.user.id ?? null;

        if (!userId) {
          return;
        }

        if (isSnapshotFresh(userId, workspaceId)) {
          apply(accessSnapshot);
          return;
        }

        if (mounted) {
          setLoaded(false);
        }

        const key = `${userId}:${workspaceId ?? ""}`;

        if (!accessRequest || accessRequest.key !== key) {
          const promise = resolveAccountId(userId, workspaceId, workspaceOwnerId)
            .then(fetchAccessLevel)
            .then((result) => {
              Object.assign(accessSnapshot, result, {
                fetchedAt: Date.now(),
                loaded: true,
                userId,
                workspaceId,
              });
              return result;
            })
            .finally(() => {
              if (accessRequest?.promise === promise) {
                accessRequest = null;
              }
            });

          accessRequest = { key, promise };
        }

        apply(await accessRequest.promise);
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
  }, [workspaceId, workspaceLoaded, workspaceOwnerId]);

  return {
    accessLevel,
    isReadOnly: accessLevel === "READ_ONLY",
    loaded,
    trialDaysRemaining,
    trialEndsAt,
  };
}
