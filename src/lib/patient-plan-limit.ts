export function getPatientPlanLimitMessage(params: {
  activePatientCount: number;
  patientLimit: number;
}) {
  return `Tu plan Free permite hasta ${params.patientLimit} pacientes activos. Tenés ${params.activePatientCount} pacientes. Archivá pacientes o reactivá tu plan para continuar.`;
}

export function getPatientPlanLimitBlock(params: {
  activePatientCount: number;
  patientLimit: number | null;
}) {
  if (params.patientLimit === null || params.patientLimit < 0) {
    return null;
  }

  if (params.activePatientCount <= params.patientLimit) {
    return null;
  }

  return getPatientPlanLimitMessage({
    activePatientCount: params.activePatientCount,
    patientLimit: params.patientLimit,
  });
}
