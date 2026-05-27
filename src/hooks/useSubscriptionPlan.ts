"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import {
  defaultPlan,
  getPatientLimit,
  type CommercialPlan,
  type PlanStatus,
} from "@/lib/plans";

export type UserPlan = {
  plan: CommercialPlan;
  estadoPlan: PlanStatus;
  límitePacientes: number | null;
  cantidadKinesiólogos: number;
};

function normalizePlan(value: unknown): CommercialPlan {
  return value === "INDEPENDIENTE" || value === "CLINICA" ? value : "FREE";
}

function normalizeStatus(value: unknown): PlanStatus {
  return value === "PENDIENTE" ||
    value === "VENCIDO" ||
    value === "CANCELADO"
    ? value
    : "ACTIVO";
}

export function useSubscriptionPlan() {
  const [plan, setPlan] = useState<UserPlan>(defaultPlan);
  const [loaded, setLoaded] = useState(false);

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
          .from("profiles")
          .select("plan, estado_plan, limite_pacientes, cantidad_kinesiologos")
          .eq("id", userData.user.id)
          .maybeSingle();

        if (error || !data) {
          return;
        }

        const currentPlan = normalizePlan(data.plan);
        const configuredLimit =
          typeof data.limite_pacientes === "number"
            ? data.limite_pacientes
            : getPatientLimit(currentPlan);

        if (mounted) {
          setPlan({
            plan: currentPlan,
            estadoPlan: normalizeStatus(data.estado_plan),
            límitePacientes: configuredLimit,
            cantidadKinesiólogos:
              typeof data.cantidad_kinesiologos === "number"
                ? data.cantidad_kinesiologos
                : currentPlan === "CLINICA"
                  ? 2
                  : 1,
          });
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
