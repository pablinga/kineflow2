"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { getFriendlyErrorMessage, mapSupabaseError } from "@/lib/error-messages";

export type WorkspaceType = "PERSONAL" | "CLINICA";
export type WorkspaceRole = "ADMIN" | "KINESIOLOGO";

export type ActiveWorkspace = {
  id: string;
  name: string;
  type: WorkspaceType;
  role: WorkspaceRole;
  sourceClinicId: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  type: WorkspaceType;
  source_clinic_id: string | null;
};

type MembershipRow = {
  role: WorkspaceRole;
  workspace_id: string;
};

const workspaceSnapshot: {
  activeWorkspaceId: string | null;
  error: string;
  loaded: boolean;
  userId: string | null;
  workspaces: ActiveWorkspace[];
} = {
  activeWorkspaceId: null,
  error: "",
  loaded: false,
  userId: null,
  workspaces: [],
};

function getStoredWorkspaceId(userId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(`kineflow.activeWorkspace.${userId}`);
}

function storeWorkspaceId(userId: string, workspaceId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(`kineflow.activeWorkspace.${userId}`, workspaceId);
}

function chooseWorkspace(
  workspaces: ActiveWorkspace[],
  preferredWorkspaceId: string | null,
  fallbackType: WorkspaceType = "PERSONAL",
) {
  return (
    workspaces.find((workspace) => workspace.id === preferredWorkspaceId) ??
    workspaces.find((workspace) => workspace.type === fallbackType) ??
    workspaces[0] ??
    null
  );
}

export function resetWorkspaceSnapshot() {
  workspaceSnapshot.activeWorkspaceId = null;
  workspaceSnapshot.error = "";
  workspaceSnapshot.loaded = false;
  workspaceSnapshot.userId = null;
  workspaceSnapshot.workspaces = [];
}

export function useActiveWorkspace() {
  const [workspaces, setWorkspaces] = useState<ActiveWorkspace[]>(
    workspaceSnapshot.workspaces,
  );
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    workspaceSnapshot.activeWorkspaceId,
  );
  const [loaded, setLoaded] = useState(workspaceSnapshot.loaded);
  const [error, setError] = useState(workspaceSnapshot.error);

  const activeWorkspace = useMemo(
    () => chooseWorkspace(workspaces, activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );

  const loadWorkspaces = useCallback(async () => {
    setLoaded(false);
    setError("");

    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getUser();

      if (sessionError || !sessionData.user) {
        throw new Error("No pudimos identificar al usuario.");
      }

      if (
        workspaceSnapshot.loaded &&
        workspaceSnapshot.userId === sessionData.user.id
      ) {
        setWorkspaces(workspaceSnapshot.workspaces);
        setActiveWorkspaceId(workspaceSnapshot.activeWorkspaceId);
        setError(workspaceSnapshot.error);
        return;
      }

      const { data: workspaceData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id, name, type, source_clinic_id")
        .order("type", { ascending: false })
        .order("created_at", { ascending: true });

      if (workspaceError) {
        throw new Error(mapSupabaseError(workspaceError));
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", sessionData.user.id)
        .maybeSingle();
      const fallbackType =
        (profileData as { account_type?: string } | null)?.account_type ===
        "CONSULTORIO"
          ? "CLINICA"
          : "PERSONAL";

      const workspaceRows = (workspaceData ?? []) as WorkspaceRow[];
      const workspaceIds = workspaceRows.map((workspace) => workspace.id);
      let membershipRows: MembershipRow[] = [];

      if (workspaceIds.length > 0) {
        const { data: membershipData, error: membershipError } = await supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", sessionData.user.id)
          .eq("status", "accepted")
          .in("workspace_id", workspaceIds);

        if (membershipError) {
          throw new Error(mapSupabaseError(membershipError));
        }

        membershipRows = (membershipData ?? []) as MembershipRow[];
      }

      const membershipByWorkspace = new Map(
        membershipRows.map((membership) => [
          membership.workspace_id,
          membership.role,
        ]),
      );
      const nextWorkspaces = workspaceRows
        .map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          role: membershipByWorkspace.get(workspace.id) ?? "KINESIOLOGO",
          sourceClinicId: workspace.source_clinic_id,
          type: workspace.type,
        }))
        .sort((left, right) => {
          if (left.type !== right.type) {
            return left.type === "PERSONAL" ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        });
      const preferredWorkspaceId = getStoredWorkspaceId(sessionData.user.id);
      const nextActiveWorkspace = chooseWorkspace(
        nextWorkspaces,
        preferredWorkspaceId,
        fallbackType,
      );
      const nextError =
        nextWorkspaces.length === 0
          ? "No encontramos espacios de trabajo asociados a tu usuario."
          : "";

      if (nextActiveWorkspace) {
        storeWorkspaceId(sessionData.user.id, nextActiveWorkspace.id);
      }

      workspaceSnapshot.activeWorkspaceId = nextActiveWorkspace?.id ?? null;
      workspaceSnapshot.error = nextError;
      workspaceSnapshot.loaded = true;
      workspaceSnapshot.userId = sessionData.user.id;
      workspaceSnapshot.workspaces = nextWorkspaces;

      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(nextActiveWorkspace?.id ?? null);
      setError(nextError);
    } catch (loadError) {
      const nextError = getFriendlyErrorMessage(
        loadError,
        "No pudimos cargar tus espacios de trabajo.",
      );

      workspaceSnapshot.activeWorkspaceId = null;
      workspaceSnapshot.error = nextError;
      workspaceSnapshot.loaded = true;
      workspaceSnapshot.workspaces = [];

      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setError(nextError);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  async function selectWorkspace(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);

    if (!workspace) {
      return;
    }

    const supabase = getSupabaseClient();
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      storeWorkspaceId(data.user.id, workspaceId);
    }

    workspaceSnapshot.activeWorkspaceId = workspaceId;
    setActiveWorkspaceId(workspaceId);
  }

  return {
    activeWorkspace,
    error,
    loaded,
    refreshWorkspaces: loadWorkspaces,
    selectWorkspace,
    workspaces,
  };
}
