export type BillingAccountType = "KINESIOLOGO" | "CONSULTORIO";

export type BillingPlan =
  | "FREE"
  | "INDEPENDIENTE"
  | "CONSULTORIO_2"
  | "CONSULTORIO_5"
  | "CONSULTORIO_10";

export type BillingPlanStatus =
  | "ACTIVO"
  | "PENDIENTE"
  | "VENCIDO"
  | "CANCELADO";

export const PLAN_LIMITS = {
  FREE: {
    maxPatients: 5,
  },
  INDEPENDIENTE: {
    maxPatients: null,
  },
  CONSULTORIO_2: {
    maxPatients: null,
  },
  CONSULTORIO_5: {
    maxPatients: null,
  },
  CONSULTORIO_10: {
    maxPatients: null,
  },
} as const;

export function canCreatePatientByPolicy(params: {
  accountType: BillingAccountType;
  activePatientCount: number;
  patientLimit: number | null;
  plan: BillingPlan;
  planStatus: BillingPlanStatus;
}) {
  if (params.plan === "INDEPENDIENTE") {
    return params.planStatus === "ACTIVO" || params.planStatus === "PENDIENTE";
  }

  if (params.plan === "FREE") {
    const limit = params.patientLimit ?? PLAN_LIMITS.FREE.maxPatients;

    return limit < 0 || params.activePatientCount < limit;
  }

  if (params.accountType === "CONSULTORIO") {
    return (
      params.planStatus === "ACTIVO" && params.plan.startsWith("CONSULTORIO_")
    );
  }

  return false;
}

export function isPlanVisibleForAccount(
  plan: BillingPlan,
  accountType: BillingAccountType,
) {
  return (
    accountType === "KINESIOLOGO" &&
    (plan === "FREE" || plan === "INDEPENDIENTE")
  );
}
