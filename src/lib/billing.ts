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
