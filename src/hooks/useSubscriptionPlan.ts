"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  defaultPlan,
  getPlanDefinition,
  getPatientLimit,
  type CommercialPlan,
  type PlanStatus,
} from "@/lib/plans";

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
} = {
  loaded: false,
  plan: defaultPlan,
  userId: null,
};

export function resetSubscriptionPlanSnapshot() {
  planSnapshot.loaded = false;
  planSnapshot.plan = defaultPlan;
  planSnapshot.userId = null;
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
  const plans = (subscription as { plans?: { code?: unknown } | Array<{ code?: unknown }> } | null)
    ?.plans;
  const planRow = Array.isArray(plans) ? plans[0] : plans;

  return normalizePlan(planRow?.code);
}

export function useSubscriptionPlan() {
  const [plan, setPlan] = useState<UserPlan>(planSnapshot.plan);
  const [loaded, setLoaded] = useState(planSnapshot.loaded);

  useEffect(() => {
    let mounted = true;

    async function loadPlan() {
      try {
        const supabase = getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();

        if (!userData.user) {
          return;
        }

        const { data, error } = await supabase
          .from("subscriptions")
          .select("status, plans(code)")
          .eq("account_id", userData.user.id)
          .order("created_at", { ascending: false })
          .maybeSingle();

        if (error) {
          return;
        }

        const currentStatus = normalizeStatus(data?.status);
        const currentPlan =
          data?.status === "ACTIVE" ? getJoinedPlanCode(data) : "FREE";
        const nextPlan = {
          plan: currentPlan,
          estadoPlan: currentStatus,
          limitePacientes: getPatientLimit(currentPlan),
          cantidadKinesiologos: getPlanDefinition(currentPlan).kinesiologistCount,
        };

        planSnapshot.loaded = true;
        planSnapshot.plan = nextPlan;
        planSnapshot.userId = userData.user.id;

        if (mounted) {
          setPlan(nextPlan);
        }
      } finally {
        if (mounted) {
          setLoaded(true);
        }
      }
    }

    loadPlan();

    return () => {
      mounted = false;
    };
  }, []);

  return {
    loaded,
    plan,
  };
}
