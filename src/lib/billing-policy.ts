export type BillingAccountType = "KINESIOLOGO" | "CONSULTORIO";

export type BillingPlan =
  | "FREE"
  | "INDEPENDIENTE"
  | "CONSULTORIO";

export type BillingPlanStatus =
  | "ACTIVO"
  | "PENDIENTE"
  | "VENCIDO"
  | "CANCELADO";

export const PLAN_LIMITS = {
  FREE: {
    maxPatients: null,
  },
  INDEPENDIENTE: {
    maxPatients: null,
  },
  CONSULTORIO: {
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
    return true;
  }

  if (params.accountType === "CONSULTORIO") {
    return (
      params.planStatus === "ACTIVO" && params.plan === "CONSULTORIO"
    );
  }

  return false;
}

export function isPlanVisibleForAccount(
  plan: BillingPlan,
  accountType: BillingAccountType,
) {
  return (
    (accountType === "KINESIOLOGO" &&
      (plan === "FREE" || plan === "INDEPENDIENTE")) ||
    (accountType === "CONSULTORIO" && plan === "CONSULTORIO")
  );
}
