export const CLINIC_PROFESSIONAL_STATUS = {
  active: "active",
  inactive: "inactive",
  pending: "pending",
} as const;

export type ClinicProfessionalStatus =
  (typeof CLINIC_PROFESSIONAL_STATUS)[keyof typeof CLINIC_PROFESSIONAL_STATUS];

export const CLINIC_PROFESSIONAL_ROLE = {
  admin: "admin",
  kinesiologist: "kinesiologist",
} as const;

export type ClinicProfessionalRole =
  (typeof CLINIC_PROFESSIONAL_ROLE)[keyof typeof CLINIC_PROFESSIONAL_ROLE];
