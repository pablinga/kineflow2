"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { getPermissionsFromPlan, type BillingPermissions } from "@/lib/billing";
import {
  decideAuthEvent,
  getAuthRouteKind,
} from "@/lib/auth-event-policy";
import { getFriendlyErrorMessage, mapAuthError, mapSupabaseError } from "@/lib/error-messages";
import {
  defaultPlan,
  getPatientLimit,
  getPlanDefinition,
  type CommercialPlan,
  type PlanStatus,
} from "@/lib/plans";
import { getSupabaseClient } from "@/lib/supabase";
import type {
  AccountType,
  AuthProfile,
} from "@/hooks/useRequireAuth";
import type {
  ActiveWorkspace,
  WorkspaceRole,
  WorkspaceType,
} from "@/hooks/useActiveWorkspace";
import type { UserPlan } from "@/hooks/useSubscriptionPlan";

type ProfileRow = {
  account_type: AccountType | null;
  full_name: string | null;
  organization_name: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  source_clinic_id: string | null;
  type: WorkspaceType;
};

type MembershipRow = {
  role: WorkspaceRole;
  workspace_id: string;
};

type SubscriptionRow = {
  plans?: { code?: unknown } | Array<{ code?: unknown }> | null;
  status?: unknown;
};

export type AuthSessionContextValue = {
  accountType: AccountType;
  activeWorkspace: ActiveWorkspace | null;
  authError: string;
  displayName: string;
  loading: boolean;
  membership: MembershipRow | null;
  permissions: BillingPermissions;
  plan: UserPlan;
  planLoaded: boolean;
  profile: AuthProfile | null;
  profileLoaded: boolean;
  redirecting: boolean;
  refreshSessionContext: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => void;
  user: User | null;
  workspaceError: string;
  workspaceLoaded: boolean;
  workspaces: ActiveWorkspace[];
};

const AUTH_VERIFY_TIMEOUT_MS = 8000;

const defaultPermissions = getPermissionsFromPlan({
  accountType: "KINESIOLOGO",
  plan: defaultPlan.plan,
  subscriptionStatus: "ACTIVE",
});

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("auth_verify_timeout")), timeoutMs);
    }),
  ]);
}

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

async function ensurePersonalWorkspace(accessToken: string) {
  const response = await fetch("/api/workspaces/ensure-personal", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    method: "POST",
  });

  if (!response.ok) {
    let message = "No pudimos preparar tu espacio de trabajo.";

    try {
      const body = (await response.json()) as { error?: string };
      message = body.error || message;
    } catch {
      // Keep the generic message when the server response is not JSON.
    }

    throw new Error(message);
  }
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

function normalizePlan(value: unknown): CommercialPlan {
  if (
    value === "INDEPENDIENTE" ||
    value === "CONSULTORIO_2" ||
    value === "CONSULTORIO_5" ||
    value === "CONSULTORIO_10"
  ) {
    return value;
  }

  return value === "CLINICA" ? "CONSULTORIO_2" : "FREE";
}

function normalizeStatus(value: unknown): PlanStatus {
  if (value === "ACTIVE") {
    return "ACTIVO";
  }

  if (value === "CANCELLED") {
    return "CANCELADO";
  }

  return "ACTIVO";
}

function getJoinedPlanCode(subscription: unknown) {
  const plans = (subscription as SubscriptionRow | null)?.plans;
  const planRow = Array.isArray(plans) ? plans[0] : plans;

  return normalizePlan(planRow?.code);
}

function mapPlan(data: unknown, activeWorkspace: ActiveWorkspace | null): UserPlan {
  let subscriptionData = data as SubscriptionRow | null;

  if (
    !subscriptionData &&
    activeWorkspace?.type === "CLINICA" &&
    activeWorkspace.role === "KINESIOLOGO"
  ) {
    subscriptionData = {
      plans: { code: "FREE" },
      status: "ACTIVE",
    };
  }

  const currentStatus = normalizeStatus(subscriptionData?.status);
  const currentPlan =
    subscriptionData?.status === "ACTIVE"
      ? getJoinedPlanCode(subscriptionData)
      : "FREE";

  return {
    cantidadKinesiologos: getPlanDefinition(currentPlan).kinesiologistCount,
    estadoPlan: currentStatus,
    limitePacientes: getPatientLimit(currentPlan),
    plan: currentPlan,
  };
}

function getProfileDisplayName(profileName: string, user: User | null) {
  if (profileName.trim()) {
    return profileName.trim().split(" ")[0];
  }

  const metadataName = user?.user_metadata?.full_name;

  if (typeof metadataName === "string" && metadataName.trim()) {
    return metadataName.trim().split(" ")[0];
  }

  return user?.email?.split("@")[0] || "profesional";
}

function startDevTimer(name: string) {
  if (process.env.NODE_ENV !== "development") {
    return () => {};
  }

  console.time(name);
  return () => console.timeEnd(name);
}

function debugAuth(message: string, details?: unknown) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.debug(message, details ?? "");
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const pathnameRef = useRef(pathname);
  const hasLoadedRef = useRef(false);
  const loadSessionContextInFlightRef = useRef<Promise<void> | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const enabled = pathname.startsWith("/dashboard");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<ActiveWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [membership, setMembership] = useState<MembershipRow | null>(null);
  const [plan, setPlan] = useState<UserPlan>(defaultPlan);
  const [permissions, setPermissions] = useState<BillingPermissions>(defaultPermissions);
  const [authError, setAuthError] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [redirecting, setRedirecting] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(!enabled);
  const [planLoaded, setPlanLoaded] = useState(!enabled);

  const activeWorkspace = useMemo(
    () => chooseWorkspace(workspaces, activeWorkspaceId),
    [activeWorkspaceId, workspaces],
  );
  const accountType = profile?.accountType ?? "KINESIOLOGO";
  const displayName = getProfileDisplayName(profile?.profileName ?? "", user);

  const clearSessionState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    setMembership(null);
    setPlan(defaultPlan);
    setPermissions(defaultPermissions);
    setAuthError("");
    setWorkspaceError("");
    setWorkspaceLoaded(true);
    setPlanLoaded(true);
    hasLoadedRef.current = false;
  }, []);

  const loadSessionContext = useCallback(async () => {
    if (!enabled) {
      return;
    }

    if (loadSessionContextInFlightRef.current) {
      return loadSessionContextInFlightRef.current;
    }

    const loadPromise = (async () => {
    const endSessionTimer = startDevTimer("kineflow:session-resolution");
    const endContextTimer = startDevTimer("kineflow:auth-context-load");
    let queryCount = 0;

    debugAuth("[PROFILE LOAD]", "start");
    debugAuth("[WORKSPACE LOAD]", "start");
    setLoading(true);
    setRedirecting(false);
    setAuthError("");
    setWorkspaceError("");
    setWorkspaceLoaded(false);
    setPlanLoaded(false);

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await withTimeout(
        supabase.auth.getSession(),
        AUTH_VERIFY_TIMEOUT_MS,
      );
      endSessionTimer();

      if (error) {
        throw new Error(mapAuthError(error));
      }

      if (!data.session) {
        setRedirecting(true);
        clearSessionState();
        router.replace(
          `/login?redirect=${encodeURIComponent(pathnameRef.current)}`,
        );
        return;
      }

      const currentUser = data.session.user;
      setUser(currentUser);

      queryCount += 3;
      let [profileResult, workspaceResult, membershipResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("account_type, full_name, organization_name")
          .eq("id", currentUser.id)
          .maybeSingle(),
        supabase
          .from("workspaces")
          .select("id, name, type, source_clinic_id")
          .order("type", { ascending: false })
          .order("created_at", { ascending: true }),
        supabase
          .from("workspace_members")
          .select("workspace_id, role")
          .eq("user_id", currentUser.id)
          .eq("status", "accepted"),
      ]);

      if (profileResult.error) {
        throw new Error(mapSupabaseError(profileResult.error));
      }

      if (workspaceResult.error) {
        throw new Error(mapSupabaseError(workspaceResult.error));
      }

      if (membershipResult.error) {
        throw new Error(mapSupabaseError(membershipResult.error));
      }

      const profileRow = profileResult.data as ProfileRow | null;
      const metadataAccountType = currentUser.user_metadata
        ?.account_type as AccountType | undefined;
      const nextAccountType =
        profileRow?.account_type ?? metadataAccountType ?? "KINESIOLOGO";
      const nextProfile = {
        accountType: nextAccountType,
        profileName:
          nextAccountType === "CONSULTORIO"
            ? profileRow?.organization_name || profileRow?.full_name || ""
            : profileRow?.full_name || "",
      };
      const fallbackType =
        nextAccountType === "CONSULTORIO" ? "CLINICA" : "PERSONAL";
      let workspaceRows = (workspaceResult.data ?? []) as WorkspaceRow[];

      if (
        nextAccountType === "KINESIOLOGO" &&
        !workspaceRows.some((workspace) => workspace.type === "PERSONAL")
      ) {
        await ensurePersonalWorkspace(data.session.access_token);
        queryCount += 2;
        [workspaceResult, membershipResult] = await Promise.all([
          supabase
            .from("workspaces")
            .select("id, name, type, source_clinic_id")
            .order("type", { ascending: false })
            .order("created_at", { ascending: true }),
          supabase
            .from("workspace_members")
            .select("workspace_id, role")
            .eq("user_id", currentUser.id)
            .eq("status", "accepted"),
        ]);

        if (workspaceResult.error) {
          throw new Error(mapSupabaseError(workspaceResult.error));
        }

        if (membershipResult.error) {
          throw new Error(mapSupabaseError(membershipResult.error));
        }

        workspaceRows = (workspaceResult.data ?? []) as WorkspaceRow[];
      }

      const membershipRows = (membershipResult.data ?? []) as MembershipRow[];
      const membershipByWorkspace = new Map(
        membershipRows.map((row) => [row.workspace_id, row.role]),
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
      const nextActiveWorkspace = chooseWorkspace(
        nextWorkspaces,
        getStoredWorkspaceId(currentUser.id),
        fallbackType,
      );

      if (nextActiveWorkspace) {
        storeWorkspaceId(currentUser.id, nextActiveWorkspace.id);
      }

      setProfile(nextProfile);
      setWorkspaces(nextWorkspaces);
      setActiveWorkspaceId(nextActiveWorkspace?.id ?? null);
      setMembership(
        nextActiveWorkspace
          ? membershipRows.find(
              (row) => row.workspace_id === nextActiveWorkspace.id,
            ) ?? null
          : null,
      );
      setWorkspaceError(
        nextWorkspaces.length === 0
          ? "No encontramos espacios de trabajo asociados a tu usuario."
          : "",
      );
      setWorkspaceLoaded(true);

      let subscriptionData: unknown = null;
      let subscriptionError: unknown = null;

      if (nextActiveWorkspace?.id) {
        queryCount += 1;
        const workspaceSubscription = await supabase
          .from("subscriptions")
          .select("status, plans(code)")
          .eq("workspace_id", nextActiveWorkspace.id)
          .order("created_at", { ascending: false })
          .maybeSingle();

        subscriptionData = workspaceSubscription.data;
        subscriptionError = workspaceSubscription.error;
      }

      if (!subscriptionData && !subscriptionError) {
        queryCount += 1;
        const accountSubscription = await supabase
          .from("subscriptions")
          .select("status, plans(code)")
          .eq("account_id", currentUser.id)
          .order("created_at", { ascending: false })
          .maybeSingle();

        subscriptionData = accountSubscription.data;
        subscriptionError = accountSubscription.error;
      }

      if (
        subscriptionError &&
        !(
          nextActiveWorkspace?.type === "CLINICA" &&
          nextActiveWorkspace.role === "KINESIOLOGO"
        )
      ) {
        throw new Error(mapSupabaseError(subscriptionError));
      }

      const nextPlan = mapPlan(subscriptionData, nextActiveWorkspace);
      setPlan(nextPlan);
      setPermissions(
        getPermissionsFromPlan({
          accountType: nextActiveWorkspace?.type === "CLINICA"
            ? "CONSULTORIO"
            : nextAccountType,
          plan: nextPlan.plan,
          subscriptionStatus:
            nextPlan.estadoPlan === "ACTIVO" ? "ACTIVE" : "PENDING_PAYMENT",
        }),
      );
      setPlanLoaded(true);

      if (process.env.NODE_ENV === "development") {
        console.info("[kineflow] auth-context queries", queryCount);
      }
    } catch (error) {
      endSessionTimer();
      clearSessionState();
      setAuthError(
        getFriendlyErrorMessage(error, "No pudimos verificar tu sesión."),
      );
    } finally {
      endContextTimer();
      setLoading(false);
    }
    })();

    loadSessionContextInFlightRef.current = loadPromise;

    try {
      await loadPromise;
    } finally {
      if (loadSessionContextInFlightRef.current === loadPromise) {
        loadSessionContextInFlightRef.current = null;
      }
    }
  }, [clearSessionState, enabled, router]);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setWorkspaceLoaded(true);
      setPlanLoaded(true);
      return;
    }

    let mounted = true;
    const supabase = getSupabaseClient();
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      const decision = decideAuthEvent({
        currentUserId: currentUserIdRef.current,
        event,
        hasLoadedSessionContext: hasLoadedRef.current,
        routeKind: getAuthRouteKind(pathnameRef.current),
        sessionUserId: session?.user.id ?? null,
      });

      debugAuth("[AUTH EVENT]", {
        decision,
        event,
        pathname: pathnameRef.current,
        sessionUserId: session?.user.id ?? null,
      });

      if (decision === "keep-session") {
        if (session?.user && session.user.id === currentUserIdRef.current) {
          setUser(session.user);
        }

        return;
      }

      if (decision === "clear-session") {
        clearSessionState();
        return;
      }

      if (decision === "redirect-login") {
        clearSessionState();
        setRedirecting(true);
        debugAuth("[AUTH REDIRECT]", "/login");
        router.replace(
          `/login?redirect=${encodeURIComponent(pathnameRef.current)}`,
        );
        return;
      }

      if (decision === "redirect-dashboard") {
        debugAuth("[AUTH REDIRECT]", "/dashboard");
        router.replace("/dashboard");
        return;
      }

      if (decision === "load-session-context") {
        void loadSessionContext();
      }
    });

    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void loadSessionContext();
    }

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [clearSessionState, enabled, loadSessionContext, router]);

  const selectWorkspace = useCallback((workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId);

    if (!workspace || !user) {
      return;
    }

    storeWorkspaceId(user.id, workspaceId);
    setActiveWorkspaceId(workspaceId);
    void loadSessionContext();
  }, [loadSessionContext, user, workspaces]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      accountType,
      activeWorkspace,
      authError,
      displayName,
      loading,
      membership,
      permissions,
      plan,
      planLoaded,
      profile,
      profileLoaded: !loading && !authError && Boolean(user),
      redirecting,
      refreshSessionContext: loadSessionContext,
      selectWorkspace,
      user,
      workspaceError,
      workspaceLoaded,
      workspaces,
    }),
    [
      accountType,
      activeWorkspace,
      authError,
      displayName,
      loadSessionContext,
      loading,
      membership,
      permissions,
      plan,
      planLoaded,
      profile,
      redirecting,
      selectWorkspace,
      user,
      workspaceError,
      workspaceLoaded,
      workspaces,
    ],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSessionContext() {
  return useContext(AuthSessionContext);
}
