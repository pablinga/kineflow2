import {
  getPlanDefinition,
  type CommercialPlan,
  type PlanDefinition,
} from "@/lib/plans";
import type { AccountType } from "@/hooks/useRequireAuth";

export type InternalSubscriptionStatus =
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "PAUSED"
  | "CANCELLED"
  | "PAST_DUE"
  | "EXPIRED";

export type BillingPermissions = {
  canManageOwnPractice: boolean;
  canCreateOwnPatients: boolean;
  canCreateOwnAppointments: boolean;
  canManageOwnPayments: boolean;
  canManageClinic: boolean;
  canInviteProfessionals: boolean;
  canCreateClinicAppointments: boolean;
  canViewClinicIncome: boolean;
  maxProfessionals: number | null;
};

export function canCreatePatient(params: {
  accountType: AccountType;
  activePatientCount: number;
  patientLimit: number | null;
  plan: CommercialPlan;
  planStatus: "ACTIVO" | "PENDIENTE" | "VENCIDO" | "CANCELADO";
}) {
  if (params.accountType === "CONSULTORIO") {
    return params.planStatus === "ACTIVO" && params.plan.startsWith("CONSULTORIO_");
  }

  if (params.plan === "INDEPENDIENTE") {
    return params.planStatus === "ACTIVO" || params.planStatus === "PENDIENTE";
  }

  if (params.plan === "FREE") {
    const limit = params.patientLimit ?? 5;

    return limit < 0 || params.activePatientCount < limit;
  }

  return false;
}

export function isPlanAllowedForAccount(
  plan: CommercialPlan,
  accountType: AccountType,
) {
  if (plan === "FREE") {
    return accountType === "KINESIOLOGO";
  }

  if (plan === "INDEPENDIENTE") {
    return accountType === "KINESIOLOGO";
  }

  return accountType === "CONSULTORIO";
}

export function getPermissionsFromPlan(params: {
  accountType: AccountType;
  plan: CommercialPlan;
  subscriptionStatus: InternalSubscriptionStatus;
}): BillingPermissions {
  const active = params.subscriptionStatus === "ACTIVE";
  const planDefinition: PlanDefinition = getPlanDefinition(params.plan);
  const isIndependent =
    params.accountType === "KINESIOLOGO" &&
    params.plan === "INDEPENDIENTE" &&
    active;
  const isClinic =
    params.accountType === "CONSULTORIO" &&
    params.plan.startsWith("CONSULTORIO_") &&
    active;

  return {
    canManageOwnPractice: isIndependent,
    canCreateOwnPatients: isIndependent,
    canCreateOwnAppointments: isIndependent,
    canManageOwnPayments: isIndependent,
    canManageClinic: isClinic,
    canInviteProfessionals: isClinic,
    canCreateClinicAppointments: isClinic,
    canViewClinicIncome: isClinic,
    maxProfessionals: isClinic ? planDefinition.kinesiologistCount : null,
  };
}
