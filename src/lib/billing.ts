import {
  getPlanDefinition,
  type CommercialPlan,
  type PlanDefinition,
} from "@/lib/plans";
import {
  canCreatePatientByPolicy,
  isPlanVisibleForAccount,
  type BillingPlanStatus,
} from "@/lib/billing-policy";
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
  planStatus: BillingPlanStatus;
}) {
  return canCreatePatientByPolicy(params);
}

export function isPlanAllowedForAccount(
  plan: CommercialPlan,
  accountType: AccountType,
) {
  return isPlanVisibleForAccount(plan, accountType);
}

export function getPermissionsFromPlan(params: {
  accountType: AccountType;
  plan: CommercialPlan;
  subscriptionStatus: InternalSubscriptionStatus;
}): BillingPermissions {
  const active = params.subscriptionStatus === "ACTIVE";
  const planDefinition: PlanDefinition = getPlanDefinition(params.plan);
  const isOwnPractice =
    params.accountType === "KINESIOLOGO" &&
    (params.plan === "FREE" || params.plan === "INDEPENDIENTE") &&
    active;
  const isClinic =
    params.accountType === "CONSULTORIO" &&
    (params.plan === "FREE" || params.plan === "CONSULTORIO") &&
    active;

  return {
    canManageOwnPractice: isOwnPractice,
    canCreateOwnPatients: isOwnPractice,
    canCreateOwnAppointments: isOwnPractice,
    canManageOwnPayments: isOwnPractice,
    canManageClinic: isClinic,
    canInviteProfessionals: isClinic,
    canCreateClinicAppointments: isClinic,
    canViewClinicIncome: isClinic,
    maxProfessionals: isClinic ? planDefinition.kinesiologistCount : null,
  };
}
