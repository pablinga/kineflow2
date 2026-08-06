"use client";

import { useEffect, useState } from "react";
import { useAuthSessionContext } from "@/contexts/AuthSessionContext";
import { getSupabaseClient } from "@/lib/supabase";
import {
  defaultPlan,
  getPlanDefinition,
  getPatientLimit,
  type CommercialPlan,
  type PlanStatus,
} from "@/lib/plans";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

export type UserPlan = {
  plan: CommercialPlan;
  estadoPlan: PlanStatus;
  limitePacientes: number | null;
  cantidadKinesiologos: number;
};

const planSnapshot: {
  loaded: boolean;
  plan: UserPlan;
  userId: string | null;
  workspaceId: string | null;
} = {
  loaded: false,
  plan: defaultPlan,
  userId: null,
  workspaceId: null,
};

export function resetSubscriptionPlanSnapshot() {
  planSnapshot.loaded = false;
  planSnapshot.plan = defaultPlan;
  planSnapshot.userId = null;
  planSnapshot.workspaceId = null;
}

function normalizePlan(value: unknown): CommercialPlan {
  if (
    value === "INDEPENDIENTE" ||
    value === "CONSULTORIO"
  ) {
    return value;
  }

  return value === "CLINICA" ? "CONSULTORIO" : "FREE";
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
  const plans = (subscription as { plans?: { code?: unknown } | Array<{ code?: unknown }> } | null)
    ?.plans;
  const planRow = Array.isArray(plans) ? plans[0] : plans;

  return normalizePlan(planRow?.code);
}

export function useSubscriptionPlan() {
  const sessionContext = useAuthSessionContext();
  const { activeWorkspace, loaded: workspaceLoaded } = useActiveWorkspace();
  const [plan, setPlan] = useState<UserPlan>(planSnapshot.plan);
  const [loaded, setLoaded] = useState(
    planSnapshot.loaded && planSnapshot.workspaceId === activeWorkspace?.id,
  );

  useEffect(() => {
    if (sessionContext) {
      return;
    }

    let mounted = true;

    async function loadPlan() {
      if (!workspaceLoaded) {
        return;
      }

      try {
        const supabase = getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          return;
        }

        if (
          planSnapshot.loaded &&
          planSnapshot.userId === userData.user.id &&
          planSnapshot.workspaceId === (activeWorkspace?.id ?? null)
        ) {
          if (mounted) {
            setPlan(planSnapshot.plan);
          }
          return;
        }

        let data: unknown = null;
        let error: unknown = null;

        if (activeWorkspace?.id) {
          const workspaceResult = await supabase
            .from("subscriptions")
            .select("status, plans(code)")
            .eq("workspace_id", activeWorkspace.id)
            .order("created_at", { ascending: false })
            .maybeSingle();

          data = workspaceResult.data;
          error = workspaceResult.error;
        }

        if (!data && !error) {
          const accountResult = await supabase
            .from("subscriptions")
            .select("status, plans(code)")
            .eq("account_id", userData.user.id)
            .order("created_at", { ascending: false })
            .maybeSingle();

          data = accountResult.data;
          error = accountResult.error;
        }

        if (error) {
          if (
            activeWorkspace?.type === "CLINICA" &&
            activeWorkspace.role === "KINESIOLOGO"
          ) {
            data = {
              plans: { code: "FREE" },
              status: "ACTIVE",
            };
          } else {
            return;
          }
        }

        if (
          !data &&
          activeWorkspace?.type === "CLINICA" &&
          activeWorkspace.role === "KINESIOLOGO"
        ) {
          data = {
            plans: { code: "FREE" },
            status: "ACTIVE",
          };
        }

        const subscriptionData = data as { status?: unknown } | null;
        const currentStatus = normalizeStatus(subscriptionData?.status);
        const currentPlan =
          subscriptionData?.status === "ACTIVE"
            ? getJoinedPlanCode(subscriptionData)
            : "FREE";
        const nextPlan = {
          plan: currentPlan,
          estadoPlan: currentStatus,
          limitePacientes: getPatientLimit(currentPlan),
          cantidadKinesiologos: getPlanDefinition(currentPlan).kinesiologistCount,
        };

        planSnapshot.loaded = true;
        planSnapshot.plan = nextPlan;
        planSnapshot.userId = userData.user.id;
        planSnapshot.workspaceId = activeWorkspace?.id ?? null;

        if (mounted) {
          setPlan(nextPlan);
        }
      } finally {
        if (mounted) {
          setLoaded(true);
        }
      }
    }

    setLoaded(false);
    loadPlan();

    return () => {
      mounted = false;
    };
  }, [
    activeWorkspace?.id,
    activeWorkspace?.role,
    activeWorkspace?.type,
    sessionContext,
    workspaceLoaded,
  ]);

  return {
    loaded: sessionContext?.planLoaded ?? loaded,
    plan: sessionContext?.plan ?? plan,
  };
}
