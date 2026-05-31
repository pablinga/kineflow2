export const ENABLE_CLINIC_FEATURES =
  process.env.NEXT_PUBLIC_ENABLE_CLINIC_FEATURES === "true";

export function shouldShowClinicFeatures() {
  return ENABLE_CLINIC_FEATURES;
}
